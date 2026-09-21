const FORMATS = {
  vertical: { label: "Shorts / TikTok / Reels", width: 1080, height: 1920, ratio: "9:16" },
  landscape: { label: "YouTube horizontal", width: 1920, height: 1080, ratio: "16:9" },
};
const TEMPLATES = { impacto: "Título em destaque", perfil: "Card de perfil", meme: "Clipe + imagem", cinema: "Cinema / título discreto" };
function badRequest(message) { return Object.assign(new Error(message), { status: 400 }); }
function parseOptions(body = {}) {
  const mode = body.mode || "recycle";
  if (!["recycle", "ai"].includes(mode)) throw badRequest("Escolha reutilizar vídeo ou criar por IA.");
  const formats = [...new Set(String(body.formats || "vertical").split(","))];
  if (!formats.length || formats.some(f => !Object.hasOwn(FORMATS, f))) throw badRequest("Formato de saída inválido.");
  const templates = [...new Set(String(body.templates || body.template || "impacto").split(","))];
  if (templates.length > 3 || templates.some(t => !Object.hasOwn(TEMPLATES, t))) throw badRequest("Escolha de 1 a 3 templates válidos.");
  const creator = String(body.creator || "Meu canal").trim();
  if (!creator || creator.length > 40) throw badRequest("O nome do perfil deve ter de 1 a 40 caracteres.");
  const captionMode = body.captionMode || "none";
  if (!["none", "pt", "translate"].includes(captionMode)) throw badRequest("Modo de legenda inválido.");
  const headlines = String(body.headlines || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (headlines.length > 3 || headlines.some(s => [...s].length > 100)) throw badRequest("Use até 3 títulos, com no máximo 100 caracteres cada.");
  const start = Number(body.start || 0);
  const duration = Number(body.duration || 30);
  if (!Number.isFinite(start) || start < 0 || start > 7200) throw badRequest("Início deve ficar entre 0 e 7200 segundos.");
  if (!Number.isFinite(duration) || duration < 3 || duration > 180) throw badRequest("O trecho deve durar de 3 a 180 segundos.");
  const sceneDuration = Number(body.sceneDuration || 5);
  if (![5, 10, 15].includes(sceneDuration)) throw badRequest("Cada cena de IA deve durar 5, 10 ou 15 segundos.");
  const prompts = String(body.prompts || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (mode === "ai" && (!prompts.length || prompts.length > 3 || prompts.some(p => p.length > 800))) {
    throw badRequest("Descreva de 1 a 3 cenas, uma por linha, com até 800 caracteres cada.");
  }
  const fit = body.fit || "contain";
  if (!["contain", "cover"].includes(fit)) throw badRequest("Enquadramento inválido.");
  return { mode, formats, templates, creator, captionMode, headlines: headlines.length ? headlines : [""], start, duration, sceneDuration, prompts: mode === "ai" ? prompts : [], fit };
}
function capabilities() {
  return {
    video: Boolean(process.env.FAL_API_KEY || process.env.FAL_KEY),
    transcription: Boolean(process.env.OPENAI_API_KEY),
    text: Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY),
    model: "wan/v2.6/text-to-video",
  };
}
function requireCapabilities(options) {
  const c = capabilities();
  if (options.mode === "ai" && !c.video) throw badRequest("Configure FAL_API_KEY no .env para gerar cenas por IA.");
  if ((options.mode === "ai" || options.captionMode === "translate") && !c.text) throw badRequest("Configure GEMINI_API_KEY ou ANTHROPIC_API_KEY para preparar cenas e traduzir legendas.");
  if (options.captionMode !== "none" && !c.transcription) throw badRequest("Configure OPENAI_API_KEY para transcrever a fala e sincronizar as legendas.");
}
module.exports = { FORMATS, TEMPLATES, parseOptions, capabilities, requireCapabilities, badRequest };
