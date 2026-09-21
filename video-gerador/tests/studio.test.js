const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseOptions } = require("../src/services/studioConfig");
const { buildAss, buildSrt, time, translateSegments } = require("../src/services/studioCaptions");
const { createJobStore } = require("../src/services/studioJobs");
const { generateScene, queueUrl } = require("../src/services/sceneGenerator");

test("validação bloqueia entradas ilimitadas, filtros e parâmetros inválidos", () => {
  for (const options of [{ mode: "bad" }, { duration: "NaN" }, { duration: 181 }, { start: -1 },
    { templates: "impacto,perfil,meme,cinema" }, { templates: "__proto__" }, { formats: "vertical,blah" },
    { sceneDuration: 6 }, { headlines: "a\nb\nc\nd" }, { headlines: "x".repeat(101) },
    { mode: "ai", prompts: "" }, { fit: "crop=100" }, { captionMode: "english" }]) assert.throws(() => parseOptions(options));
  assert.deepEqual(parseOptions({ formats: "vertical,vertical,landscape" }).formats, ["vertical", "landscape"]);
  assert.equal(parseOptions({ mode: "ai", prompts: "Uma cena\nOutra cena" }).prompts.length, 2);
});
test("legendas preservam frases, limites de duração e não interpretam tags ASS do usuário", () => {
  const ass = buildAss({ segments: [{ start: 0, end: 10, text: "Olá {\\pos(0,0)} mundo!" }], headline: "Título {\\b1}", duration: 5, format: "vertical", template: "impacto" });
  assert.match(ass, /PlayResX: 1080/); assert.doesNotMatch(ass, /\{\\pos\(0,0\)\}/); assert.doesNotMatch(ass, /0:00:10/);
  assert.equal(time(59.999), "0:01:00.00"); assert.equal(time(59.9999, true), "00:01:00,000");
  assert.match(buildSrt([{ start: 0, end: 10, text: "Olá" }], 5), /00:00:05,000/);
});
test("tradução mantém timestamps e rejeita segmentos perdidos ou trocados", async () => {
  const source = [{ id: 0, start: 1.2, end: 3.5, text: "Hello" }];
  assert.deepEqual(await translateSegments(source, async () => '[{"id":0,"text":"Olá"}]'), [{ ...source[0], text: "Olá" }]);
  await assert.rejects(translateSegments(source, async () => '[{"id":3,"text":"Olá"}]'), /preservou/);
  await assert.rejects(translateSegments(source, async () => "[]"), /preservou/);
  await assert.rejects(translateSegments(source, async () => "not json"), /JSON/);
});
test("fila executa uma tarefa por vez, continua depois de falha e preserva histórico", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-queue-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let concurrent = 0, maxConcurrent = 0;
  const store = createJobStore({ root, worker: async job => {
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise(r => setTimeout(r, 10)); concurrent--;
    if (job.options.headlines[0] === "fail") throw new Error("Falha simulada");
  } });
  const failed = store.create(parseOptions({ headlines: "fail" })), success = store.create(parseOptions({}));
  while (["queued", "running"].includes(store.get(success.id).status)) await new Promise(r => setTimeout(r, 10));
  assert.equal(maxConcurrent, 1); assert.equal(store.get(failed.id).status, "failed");
  assert.equal(store.get(success.id).status, "completed"); assert.equal(store.get(success.id).progress, 100);
  assert.equal(store.get(success.id).workDir, undefined);
  assert.equal(createJobStore({ root }).get(success.id).status, "completed");
  const file = path.join(root, "data/studio-jobs", `${failed.id}.json`);
  const metadata = JSON.parse(fs.readFileSync(file)); metadata.status = "running";
  fs.writeFileSync(file, JSON.stringify(metadata));
  assert.equal(createJobStore({ root }).get(failed.id).status, "interrupted");
});
test("fal: um único envio, polling, IDs persistíveis e download sem credenciais", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fal-"));
  const previous = process.env.FAL_API_KEY; process.env.FAL_API_KEY = "test-only";
  t.after(() => { if (previous === undefined) delete process.env.FAL_API_KEY; else process.env.FAL_API_KEY = previous; fs.rmSync(root, { recursive: true, force: true }); });
  const calls = []; let saved;
  const responses = [{ request_id: "request-1", status_url: "https://queue.fal.run/status/1", response_url: "https://queue.fal.run/result/1" },
    { status: "IN_PROGRESS" }, { status: "COMPLETED" }, { video: { url: "https://v3b.fal.media/test.mp4" } }];
  const output = path.join(root, "scene.mp4");
  await generateScene({ description: "Cena teste", duration: 5, ratio: "9:16", outputPath: output, onSubmitted: value => { saved = value; } }, {
    sleep: async () => {}, generateText: async () => "English scene prompt",
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => responses.shift(), buffer: async () => Buffer.from("fixture") }; },
  });
  assert.equal(calls.filter(c => c.options.method === "POST").length, 1); assert.equal(saved.requestId, "request-1");
  assert.equal(calls.at(-1).options.headers, undefined); assert.equal(JSON.parse(calls[0].options.body).duration, "5");
  assert.equal(fs.readFileSync(output, "utf8"), "fixture"); assert.throws(() => queueUrl("https://evil.example/status"));
});
test("rota retorna JSON para erros e não encontra nomes arbitrários de tarefa", async t => {
  const express = require("express"), { createStudioRouter } = require("../src/routes/studio");
  const app = express();
  app.use("/api/studio", createStudioRouter({ store: { list: () => [], get: () => null, pending: () => 0 }, toolCheck: async () => ({ ready: true }) }));
  const server = app.listen(0); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/studio`;
  const response = await fetch(`${url}/jobs/not-a-job`); assert.equal(response.status, 404); assert.match((await response.json()).error, /encontrada/);
  const body = new FormData(); body.append("mode", "recycle");
  const invalid = await fetch(`${url}/jobs`, { method: "POST", body }); assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /Envie/);
});
