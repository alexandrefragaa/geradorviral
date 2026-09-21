const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { FORMATS, TEMPLATES, parseOptions, capabilities, requireCapabilities, badRequest } = require("../services/studioConfig");
const { createJobStore } = require("../services/studioJobs");
const { probe, run, checkTools } = require("../services/studioRender");

function createStudioRouter({ store = createJobStore(), toolCheck = checkTools } = {}) {
  const router = express.Router();
  const upload = multer({ dest: path.join(__dirname, "../../uploads"), limits: { fileSize: 250 * 1024 * 1024, files: 2, fields: 16, fieldSize: 16000 },
    fileFilter(req, file, cb) {
      const valid = file.fieldname === "video" ? /\.(mp4|mov|webm|mkv)$/i.test(file.originalname) : /\.(png|jpe?g|webp)$/i.test(file.originalname);
      cb(valid ? null : badRequest("Envie vídeo MP4, MOV, WebM ou MKV; imagem PNG, JPG ou WebP."), valid);
    } });
  let tools;
  const ready = async () => { if (!tools?.ready) tools = await toolCheck(); return tools; };
  router.get("/config", async (req, res) => res.json({ formats: FORMATS, templates: TEMPLATES, capabilities: capabilities(), tools: await ready(), maxUploadMB: 250 }));
  router.get("/jobs", (req, res) => res.json(store.list()));
  router.get("/jobs/:id", (req, res) => {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Geração não encontrada." });
    res.json(job);
  });
  router.post("/jobs", (req, res, next) => {
    if (store.pending() >= 5) return res.status(429).json({ error: "A fila está cheia. Aguarde uma geração terminar." });
    next();
  }, upload.fields([{ name: "video", maxCount: 1 }, { name: "reaction", maxCount: 1 }]), async (req, res) => {
    const files = Object.values(req.files || {}).flat();
    try {
      if (store.pending() >= 5) throw Object.assign(new Error("A fila está cheia. Aguarde uma geração terminar."), { status: 429 });
      const options = parseOptions(req.body);
      requireCapabilities(options);
      const toolStatus = await ready();
      if (!toolStatus.ready) throw badRequest("Instale FFmpeg e FFprobe com libass e adicione ao PATH. " + toolStatus.error);
      const video = req.files?.video?.[0], reaction = req.files?.reaction?.[0];
      if (options.mode === "recycle" && !video) throw badRequest("Envie o vídeo que deseja reaproveitar.");
      if (options.mode === "ai" && video) throw badRequest("No modo IA, descreva as cenas; use o modo Reaproveitar para enviar vídeo.");
      if (options.templates.includes("meme") && !reaction) throw badRequest("Envie uma imagem para o template Clipe + imagem.");
      if (reaction) {
        if (reaction.size > 10 * 1024 * 1024) throw badRequest("A imagem deve ter no máximo 10 MB.");
        const media = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_streams", "-of", "json", reaction.path], { timeout: 10000 }));
        const image = media.streams?.[0];
        if (!image || !["png", "mjpeg", "webp"].includes(image.codec_name) || image.width > 8000 || image.height > 8000) throw badRequest("Imagem inválida ou maior que 8000 pixels.");
      }
      if (video) {
        const info = await probe(video.path);
        if (options.start >= info.duration) throw badRequest("O início do trecho está depois do fim do vídeo.");
        if (!info.hasAudio && options.captionMode !== "none") throw badRequest("Este vídeo não tem áudio. Escolha Sem legendas.");
      }
      const job = store.create(options, video?.path, reaction?.path);
      res.status(202).json(job);
    } catch (err) {
      await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
      res.status(err.status || 400).json({ error: err.message });
    }
  });
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "O arquivo ultrapassa 250 MB." : "Upload inválido: confira a quantidade e o tamanho dos campos." });
    res.status(err.status || 500).json({ error: err.message || "Falha no upload." });
  });
  return router;
}
module.exports = createStudioRouter();
module.exports.createStudioRouter = createStudioRouter;
