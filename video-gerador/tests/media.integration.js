const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), os = require("os");
const { ffmpeg, probe, extractClip, renderVariant, joinScenes } = require("../src/services/studioRender");
const { buildAss } = require("../src/services/studioCaptions");
const { parseOptions } = require("../src/services/studioConfig");
const { createJobStore } = require("../src/services/studioJobs");

test("FFmpeg real: recorte sem áudio, concatenação, quatro templates e duas proporções", { timeout: 240000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio media ' teste "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "original.mp4"), source = path.join(root, "source.mp4"), reaction = path.join(root, "reaction.png");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", input]);
  await ffmpeg(["-f", "lavfi", "-i", "color=c=0x8e425a:s=320x240", "-frames:v", "1", reaction]);
  const info = await probe(input); assert.equal(info.hasAudio, false);
  await assert.rejects(extractClip(input, source, 9, 3, info), /depois/);
  assert.equal((await extractClip(input, source, 3, 3, info)).duration, 1);
  assert.equal((await probe(source)).hasAudio, true);
  for (const format of ["vertical", "landscape"]) for (const template of ["impacto", "perfil", "meme", "cinema"]) {
    const assFile = `captions-${format}-${template}.ass`, output = path.join(root, `${format}-${template}.mp4`);
    fs.writeFileSync(path.join(root, assFile), buildAss({ segments: [{ start: 0, end: 1, text: "Legendas em português: ação e emoção." }], headline: "Olha esse detalhe na cena!", duration: 1, format, template, ai: true }));
    await renderVariant({ source, output, format, template, fit: template === "cinema" ? "cover" : "contain", assFile, workDir: root, reactionPath: reaction });
    const video = await probe(output);
    assert.equal(video.width, format === "vertical" ? 1080 : 1920); assert.equal(video.height, format === "vertical" ? 1920 : 1080);
    assert.ok(Math.abs(video.duration - 1) < 0.2); assert.equal(video.hasAudio, true);
  }
  const combined = await joinScenes([source, source], path.join(root, "joined.mp4"), root, "9:16");
  assert.ok(Math.abs(combined.duration - 2) < 0.2);
});
test("pipeline completo gera variações reais e mantém saídas após reiniciar o store", { timeout: 180000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pipeline-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "input.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=0x374558:s=320x180:r=30", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", input]);
  const store = createJobStore({ root });
  const job = store.create(parseOptions({ templates: "impacto,perfil", headlines: "Título A\nTítulo B", duration: 3 }), input);
  while (["queued", "running"].includes(store.get(job.id).status)) await new Promise(r => setTimeout(r, 100));
  const result = store.get(job.id); assert.equal(result.status, "completed", result.error); assert.equal(result.outputs.length, 4);
  for (const output of result.outputs) assert.ok(fs.statSync(path.join(root, "output", job.id, output.fileName)).size > 1000);
  assert.equal(fs.existsSync(path.join(root, "uploads/studio", job.id)), false);
  assert.equal(createJobStore({ root }).get(job.id).outputs.length, 4);
});
