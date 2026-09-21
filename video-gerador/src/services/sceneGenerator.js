const fs = require("fs/promises");
const fetch = require("node-fetch");
const { generateText } = require("./studioText");
const MODEL = "wan/v2.6/text-to-video";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function queueUrl(value) {
  const url = new URL(value);
  if (url.origin !== "https://queue.fal.run") throw new Error("O provedor retornou uma URL de fila inválida.");
  return url.href;
}
async function generateScene({ description, duration, ratio, outputPath, onSubmitted = () => {} }, deps = {}) {
  const request = deps.fetch || fetch;
  const sleep = deps.sleep || delay;
  const key = process.env.FAL_API_KEY || process.env.FAL_KEY;
  if (!key) throw new Error("Configure FAL_API_KEY para gerar cenas.");
  const prompt = await (deps.generateText || generateText)(
    "Write only an English video generation prompt, maximum 1400 characters. Translate the user's scene faithfully. " +
    "Visual direction: original cinematic open-world action game concept, GTA VI inspired tropical coastal city, " +
    "realistic 3D rendering, dynamic camera, clear central subject. No logos, HUD, watermarks or embedded captions. " +
    "This is an AI concept scene, not actual game footage. Do not claim it is official. Prefer ambient sound without dialogue unless requested.", description);
  if (prompt.length > 1500) throw new Error("Descrição gerada ficou longa demais. Simplifique a cena.");
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const json = async (url, options = {}) => {
    const res = await request(url, { timeout: 60000, ...options, headers, redirect: "error" });
    if (!res.ok) throw new Error(`Geração de cena: fal.ai respondeu HTTP ${res.status}. Verifique saldo, chave e disponibilidade.`);
    return res.json();
  };
  // Never automatically resubmit: a second POST could charge for a duplicate scene.
  const submitted = await json(`https://queue.fal.run/${MODEL}`, {
    method: "POST", body: JSON.stringify({ prompt, duration: String(duration), aspect_ratio: ratio,
      resolution: "720p", enable_prompt_expansion: true, multi_shots: false, enable_safety_checker: true }),
  });
  const statusUrl = queueUrl(submitted.status_url);
  const resultUrl = queueUrl(submitted.response_url);
  await onSubmitted({ requestId: submitted.request_id, statusUrl, resultUrl });
  let completed = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    const state = await json(statusUrl);
    if (state.status === "COMPLETED") { completed = true; break; }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(state.status)) throw new Error("A geração foi cancelada ou falhou no provedor.");
    await sleep(5000);
  }
  if (!completed) throw new Error("A geração excedeu 20 minutos. Consulte o requestId no painel fal.ai antes de tentar novamente; ela pode continuar no provedor.");
  const result = await json(resultUrl);
  const mediaUrl = new URL(result.video?.url);
  if (mediaUrl.protocol !== "https:" || !(mediaUrl.hostname === "fal.media" || mediaUrl.hostname.endsWith(".fal.media"))) {
    throw new Error("O provedor retornou uma URL de vídeo não reconhecida.");
  }
  const media = await request(mediaUrl.href, { timeout: 120000, size: 250 * 1024 * 1024, redirect: "error" });
  if (!media.ok) throw new Error("Não foi possível baixar a cena gerada. Consulte o requestId no painel fal.ai.");
  await fs.writeFile(outputPath, await media.buffer());
  return outputPath;
}
module.exports = { generateScene, queueUrl, MODEL };
