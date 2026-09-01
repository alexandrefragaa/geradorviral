const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const { generateVoice, listVoices } = require("../services/tts");
const { generateScript, listProfiles, analyzeScript } = require("../services/scriptGenerator");
const {
  generateCharacterImage,
  listCharacters,
  inferOutfitFromScript,
} = require("../services/characterImageGen");

function pickProfileForTopic(topic, profilesList) {
  const text = String(topic || "").toLowerCase();
  if (!text) return profilesList[0];

  const ranked = [...profilesList].sort((a, b) => {
    const scoreA = (a.temas || []).reduce((sum, item) => sum + (text.includes(item.toLowerCase()) ? 2 : 0), 0);
    const scoreB = (b.temas || []).reduce((sum, item) => sum + (text.includes(item.toLowerCase()) ? 2 : 0), 0);
    return scoreB - scoreA;
  });

  if (/(cient|física|teoria|multiverso|realidade|laborat|ciência|química)/.test(text)) {
    return ranked.find((p) => p.key === "jornal_do_rick") || ranked[0];
  }
  if (/(fofoca|viral|internet|polêmic|humor|escândalo|notícia|mídia)/.test(text)) {
    return ranked.find((p) => p.key === "jornal_do_cartman") || ranked[0];
  }
  if (/(algoritmo|controle|sociedade|mídia|manipul|segredo|conspira|governo|realidade)/.test(text)) {
    return ranked.find((p) => p.key === "peter_conspira") || ranked[0];
  }

  return ranked[0] || profilesList[0];
}

function pickCharacterForTopic(topic, charactersList) {
  const text = String(topic || "").toLowerCase();
  if (!text) return charactersList[0];

  const byWeight = [...charactersList].sort((a, b) => {
    const aScore = (a.nome || a.key || "").toLowerCase().split(/\s+/).filter(Boolean).reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    const bScore = (b.nome || b.key || "").toLowerCase().split(/\s+/).filter(Boolean).reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    return bScore - aScore;
  });

  if (/(cient|teoria|multiverso|realidade|laborat|física|química)/.test(text)) {
    return byWeight.find((c) => c.key === "rick_sanchez") || byWeight[0];
  }
  if (/(fofoca|viral|internet|mídia|polêmic|humor|escândalo)/.test(text)) {
    return byWeight.find((c) => c.key === "cartman") || byWeight[0];
  }
  if (/(algoritmo|controle|sociedade|segredo|conspira|mundo|governo)/.test(text)) {
    return byWeight.find((c) => c.key === "peter_griffin") || byWeight[0];
  }

  return byWeight[0] || charactersList[0];
}

function pickVoiceKeyForCharacter(characterKey, voicesList) {
  const voice = voicesList.find((item) => item.key === characterKey);
  if (voice && voice.referenceId) return voice.key;
  return voicesList.find((item) => item.referenceId)?.key || voicesList[0]?.key;
}

function pickBackgroundList(backgroundOverride) {
  const list = Array.isArray(backgroundOverride) ? backgroundOverride :
    (backgroundOverride ? String(backgroundOverride).split(",").map((s) => s.trim()).filter(Boolean) : []);

  if (list.length > 0) return list;

  const backgroundsDir = path.join(__dirname, "../../backgrounds");
  if (!fs.existsSync(backgroundsDir)) return [];

  const files = fs.readdirSync(backgroundsDir)
    .filter((name) => /\.(mp4|mov|mkv|webm|avi)$/i.test(name))
    .sort();

  return files.slice(0, 2);
}

function pickMusicPath(musicOverride) {
  if (musicOverride && String(musicOverride).trim()) return String(musicOverride).trim();

  const musicDir = path.join(__dirname, "../../music");
  if (!fs.existsSync(musicDir)) return undefined;

  const files = fs.readdirSync(musicDir)
    .filter((name) => /\.(mp3|wav|aac|m4a)$/i.test(name))
    .sort();

  return files[0];
}

async function generateFromTrendSelection(options = {}) {
  const { topic, channelKey, characterKey, voiceKey, backgroundList, music, targetDuration, channelHistory = [] } = options;
  const styles = listProfiles();
  const characters = listCharacters();
  const voices = listVoices();

  const trendTopic = topic || "algoritmo da atenção e teoria da manipulação digital";
  const selectedProfile = styles.find((p) => p.key === channelKey) || pickProfileForTopic(trendTopic, styles);
  const selectedCharacter = characters.find((c) => c.key === characterKey) || pickCharacterForTopic(trendTopic, characters);
  const selectedVoice = voiceKey || pickVoiceKeyForCharacter(selectedCharacter.key, voices);
  const selectedBackgrounds = pickBackgroundList(backgroundList);
  const selectedMusic = pickMusicPath(music);

  const script = await generateScript(selectedProfile.key, trendTopic, {
    targetDuration: targetDuration || 60,
    variacoes: 1,
  });

  const analysis = analyzeScript(script);
  const creativePlan = buildCreativePlan(script, trendTopic, channelHistory, selectedProfile);

  return {
    topic: trendTopic,
    channelKey: selectedProfile.key,
    characterKey: selectedCharacter.key,
    voiceKey: selectedVoice,
    backgroundList: selectedBackgrounds,
    music: selectedMusic,
    script,
    analysis,
    creativePlan,
    outfitHint: inferOutfitFromScript(selectedCharacter.key, script, trendTopic),
    profile: selectedProfile,
    character: selectedCharacter,
  };
}
const { getCachedTrends } = require("../services/trendsCache");
const { transcribeWithTimestamps } = require("../services/transcribe");
const { cutoutCharacter } = require("../services/cutout");
const { buildStyledSubtitles } = require("../services/subtitles");
const { composeVideo } = require("../services/compose");
const { buildCreativePlan, analyzeChannelHistory } = require("../services/channelAnalyzer");

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
    const analysis = analyzeScript(Array.isArray(script) ? script[0] : script);
    res.json({ script, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/channel-analysis", express.json(), async (req, res) => {
  try {
    const { channelHistory } = req.body || {};
    const result = analyzeChannelHistory(channelHistory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/autopilot", express.json(), async (req, res) => {
  try {
    const { topic, channelKey, characterKey, voiceKey, backgroundList, music, targetDuration, channelHistory } = req.body || {};
    const channelAnalysis = analyzeChannelHistory(channelHistory);
    const selection = await generateFromTrendSelection({
      topic,
      channelKey,
      characterKey,
      voiceKey,
      backgroundList,
      music,
      targetDuration,
      channelHistory,
    });

    const jobId = uuid();
    const workDir = path.join(__dirname, "../../output", jobId);
    fs.mkdirSync(workDir, { recursive: true });

    let backgroundPaths = selection.backgroundList.length > 0
      ? selection.backgroundList.map((name) => path.join(__dirname, "../../backgrounds", name))
      : [];

    if (backgroundPaths.length === 0) {
      const fallbackBg = path.join(workDir, "fallback-bg.mp4");
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input("color=c=#0f172a:s=1080x1920:d=10")
          .inputOptions(["-f", "lavfi"])
          .videoFilters("fps=30,format=yuv420p")
          .outputOptions(["-t", String(selection.analysis.wordCount > 0 ? 10 : 10)])
          .output(fallbackBg)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      backgroundPaths = [fallbackBg];
    }

    const musicPath = selection.music
      ? path.join(__dirname, "../../music", selection.music)
      : undefined;

    const voicePath = path.join(workDir, "voice.mp3");
    await generateVoice(selection.script, selection.voiceKey, voicePath);
    const duration = await getAudioDuration(voicePath);

    const words = await transcribeWithTimestamps(voicePath);
    const subtitlesPath = path.join(workDir, "captions.ass");
    buildStyledSubtitles(words, subtitlesPath, {});

    const rawImagePath = path.join(workDir, "character_raw.png");
    await generateCharacterImage(selection.characterKey, selection.outfitHint, selection.script || selection.topic, rawImagePath);
    const characterCutoutPath = path.join(workDir, "character.png");
    await cutoutCharacter(rawImagePath, characterCutoutPath);

    const outputPath = path.join(workDir, "final.mp4");
    const effortPreset = {
      zoom: true,
      transitionDuration: 0.7,
      characterPop: true,
      filterPreset: selection.creativePlan.filterPreset,
      stickerText: selection.creativePlan.stickerText,
      cameraMotion: selection.creativePlan.cameraMotion,
    };

    await composeVideo({
      backgroundPaths,
      characterPath: characterCutoutPath,
      voicePath,
      subtitlesPath,
      musicPath,
      duration,
      outputPath,
      effects: effortPreset,
    });

    res.json({
      jobId,
      status: "autopilot_concluído",
      videoUrl: `/output/${jobId}/final.mp4`,
      topic: selection.topic,
      channelKey: selection.channelKey,
      characterKey: selection.characterKey,
      voiceKey: selection.voiceKey,
      script: selection.script,
      analysis: selection.analysis,
      creativePlan: selection.creativePlan,
      channelAnalysis,
      outfitHint: selection.outfitHint,
      selectedBackgrounds: selection.backgroundList,
    });
  } catch (err) {
    console.error("[autopilot]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/analyze-script", express.json(), (req, res) => {
  try {
    const { script } = req.body || {};
    if (!script || !String(script).trim()) {
      return res.status(400).json({ error: "Faltam campos: script" });
    }
    res.json({ analysis: analyzeScript(script) });
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

    const analysis = analyzeScript(script);
    const outfitHint = outfit || inferOutfitFromScript(characterKey, script, topic || "");

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
      await generateCharacterImage(characterKey, outfitHint, script || topic || "", rawImagePath);
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
      analysis,
      outfitHint,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
