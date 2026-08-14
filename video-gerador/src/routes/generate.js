const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const { generateVoice, listVoices } = require("../services/tts");
const { generateScript, listProfiles } = require("../services/scriptGenerator");
const { generateCharacterImage, listCharacters } = require("../services/characterImageGen");
const { getCachedTrends } = require("../services/trendsCache");
const { transcribeWithTimestamps } = require("../services/transcribe");
const { cutoutCharacter } = require("../services/cutout");
const { buildStyledSubtitles } = require("../services/subtitles");
const { composeVideo } = require("../services/compose");

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, "../../uploads") });

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration);
    });
  });
}

// GET /styles -> lista os perfis de canal disponíveis (peter_conspira, jornal_do_cartman, jornal_do_rick...)
router.get("/styles", (req, res) => {
  res.json(listProfiles());
});

// GET /voices -> lista as vozes de personagem disponíveis (Fish Audio)
router.get("/voices", (req, res) => {
  res.json(listVoices());
});

// GET /characters -> lista os 15 personagens magnéticos (pra geração de imagem)
router.get("/characters", (req, res) => {
  res.json(listCharacters());
});

// GET /trends -> vídeos em alta com personagens (YouTube, últimos 30 dias), atualizado a cada 5min
router.get("/trends", (req, res) => {
  res.json(getCachedTrends());
});

// POST /generate-script { channelKey, topic, targetDuration?, variacoes? }
// targetDuration: 60 (padrão, elegível pra monetização no TikTok) ou 45 (só alcance)
// variacoes: gera N roteiros com ganchos diferentes pra testar formato (A/B)
router.post("/generate-script", express.json(), async (req, res) => {
  try {
    const { channelKey, topic, targetDuration, variacoes } = req.body;
    if (!channelKey || !topic) {
      return res.status(400).json({ error: "Faltam campos: channelKey, topic" });
    }
    const script = await generateScript(channelKey, topic, {
      targetDuration: targetDuration || 60,
      variacoes: variacoes || 1,
    });
    res.json({ script });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /generate
// form-data: character (imagem), script (texto), voiceId, background (nome do arquivo em /backgrounds), music (opcional)
router.post("/generate", upload.single("character"), async (req, res) => {
  const jobId = uuid();
  const workDir = path.join(__dirname, "../../output", jobId);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    let {
      script, voiceKey, background, backgrounds, music, style, channelKey, topic, effects,
      characterKey, outfit, targetDuration,
    } = req.body;

    // se não veio um roteiro pronto, mas veio channelKey + topic, gera automaticamente
    // no estilo do canal de referência (ex: "peter_conspira")
    if (!script && channelKey && topic) {
      script = await generateScript(channelKey, topic, { targetDuration: targetDuration || 60 });
    }

    // aceita um fundo só ("background") ou vários pra dar transição ("backgrounds",
    // separados por vírgula ou já como array vindo do form web)
    let backgroundList = backgrounds || background;
    if (typeof backgroundList === "string") backgroundList = backgroundList.split(",").map((s) => s.trim());
    if (!Array.isArray(backgroundList)) backgroundList = backgroundList ? [backgroundList] : [];

    if ((!req.file && !characterKey) || !script || !voiceKey || backgroundList.length === 0) {
      return res.status(400).json({
        error:
          "Faltam campos: (character [arquivo] ou characterKey [gera a imagem]), voiceKey, background(s), e (script) ou (channelKey + topic)",
      });
    }

    const backgroundPaths = backgroundList.map((name) => {
      const p = path.join(__dirname, "../../backgrounds", name);
      if (!fs.existsSync(p)) throw new Error(`Fundo não encontrado: ${name}`);
      return p;
    });
    const musicPath = music
      ? path.join(__dirname, "../../music", music)
      : undefined;

    // 1) Voz
    const voicePath = path.join(workDir, "voice.mp3");
    await generateVoice(script, voiceKey, voicePath);
    const duration = await getAudioDuration(voicePath);

    // 2) Transcrição com timestamp por palavra -> legenda
    const words = await transcribeWithTimestamps(voicePath);
    const subtitlesPath = path.join(workDir, "captions.ass");
    buildStyledSubtitles(words, subtitlesPath, style ? JSON.parse(style) : {});

    // 3) Personagem: usa a imagem enviada, ou gera uma nova (roupa/cena do roteiro) via Seedream
    const characterCutoutPath = path.join(workDir, "character.png");
    if (req.file) {
      await cutoutCharacter(req.file.path, characterCutoutPath);
    } else {
      const rawImagePath = path.join(workDir, "character_raw.png");
      await generateCharacterImage(characterKey, outfit, topic || script, rawImagePath);
      await cutoutCharacter(rawImagePath, characterCutoutPath);
    }

    // 4) Composição final (com zoom de câmera, transições entre fundos e "pop" do personagem)
    const outputPath = path.join(workDir, "final.mp4");
    await composeVideo({
      backgroundPaths,
      characterPath: characterCutoutPath,
      voicePath,
      subtitlesPath,
      musicPath,
      duration,
      outputPath,
      effects: effects ? JSON.parse(effects) : {},
    });

    res.json({
      jobId,
      status: "concluído",
      videoUrl: `/output/${jobId}/final.mp4`,
      script,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
