function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function analyzeHistoricVideos(channelHistory = []) {
  const videos = Array.isArray(channelHistory) ? channelHistory : [];
  const text = videos
    .map((video) => `${video.title || video.titulo || video.name || ""} ${video.topic || video.tema || ""}`)
    .join(" ")
    .toLowerCase();

  const hasCiencia = /(cient|física|teoria|realidade|multiverso|laborat|química|engenharia)/i.test(text);
  const hasMidia = /(algoritmo|mídia|viral|internet|telegram|notícia|polêmic|escândalo|controle|manipul)/i.test(text);
  const hasCaos = /(absurdo|caos|quebra|reviravolta|tragédia|desgraça|impact|surpresa)/i.test(text);
  const hasPositivo = /(dica|sucesso|ganhar|vantagem|melhor|incrível|vibe|feliz|inovação)/i.test(text);

  const dominant = hasCaos ? "radical" : hasMidia ? "negative" : hasCiencia ? "impact" : hasPositivo ? "positive" : "impact";

  return {
    dominant,
    signals: {
      ciencia: hasCiencia,
      midia: hasMidia,
      caos: hasCaos,
      positivo: hasPositivo,
    },
    source: videos.length > 0 ? "historico" : "fallback",
    videoCount: videos.length,
  };
}

function normalizeHistory(channelHistory) {
  if (!channelHistory) return [];
  if (Array.isArray(channelHistory)) return channelHistory;
  if (Array.isArray(channelHistory.videos)) return channelHistory.videos;
  if (Array.isArray(channelHistory.items)) return channelHistory.items;
  if (channelHistory.title || channelHistory.topic) return [channelHistory];
  return [];
}

function buildCreativePlan(script, topic = "", channelHistory = [], profile = {}) {
  const text = normalizeText(`${topic} ${script}`);
  const history = analyzeHistoricVideos(normalizeHistory(channelHistory));

  const negative = /(absurdo|caos|quebra|falha|segredo|manipul|escândalo|mídia|controle|polêmica|drama|tragédia|roubo|problema)/i.test(text);
  const positive = /(sucesso|dica|ganhou|melhor|vitoria|impacto|inovação|positivo|feliz|confiança|vantagem)/i.test(text);
  const radical = /(algoritmo|conspira|realidade|mundo|sociedade|governo|sistema|controle|teoria|multiverso|secreto)/i.test(text);
  const ciencia = /(cient|física|química|teoria|laborat|realidade|multiverso|engenharia)/i.test(text);

  const mood = radical || history.dominant === "radical"
    ? "radical"
    : negative || history.dominant === "negative"
      ? "negative"
      : ciencia
        ? "impact"
        : positive || history.dominant === "positive"
          ? "positive"
          : "impact";

  const visualStyleMap = {
    radical: {
      filterPreset: "contrast=1.35:saturation=1.8:brightness=-0.03,curves=master=0.05/0.1:0.45/0.55:0.85/0.9",
      stickerText: "ALERTA",
      backgroundKeywords: ["neon", "dark", "urban", "city", "subway", "night"],
      imageKeywords: ["reação", "impacto", "alerta", "meme", "radical", "close-up"],
      cameraMotion: "zoom rápido + pulse + flash de contraste",
      accent: "vermelho e amarelo",
    },
    negative: {
      filterPreset: "eq=contrast=1.25:saturation=1.2:brightness=-0.04,hue=s=0.1",
      stickerText: "QUEBROU",
      backgroundKeywords: ["cinza", "rua", "tensão", "escuro", "sombrio", "turbulência"],
      imageKeywords: ["crise", "reação", "problema", "desastre", "mau sinal"],
      cameraMotion: "camera lenta + close + pulso dramático",
      accent: "azul escuro e vermelho",
    },
    impact: {
      filterPreset: "eq=contrast=1.2:saturation=1.4:brightness=0.02,unsharp=3:3:0.7",
      stickerText: "IMPACTO",
      backgroundKeywords: ["futurista", "estúdio", "cinematic", "news", "street", "urban"],
      imageKeywords: ["fatos", "investigação", "notícia", "gráfico", "close-up"],
      cameraMotion: "zoom moderado + foco dinâmico",
      accent: "amarelo, azul e branco",
    },
    positive: {
      filterPreset: "eq=contrast=1.15:saturation=1.6:brightness=0.05,unsharp=2:2:0.6",
      stickerText: "VITÓRIA",
      backgroundKeywords: ["sunset", "gold", "bright", "clean", "uplift", "happy"],
      imageKeywords: ["sucesso", "vibe", "ganho", "dica", "motivation", "celebração"],
      cameraMotion: "push-in suave + glow vibrante",
      accent: "amarelo, verde e laranja",
    },
  };

  const plan = visualStyleMap[mood] || visualStyleMap.impact;
  return {
    mood,
    filterPreset: plan.filterPreset,
    stickerText: plan.stickerText,
    backgroundKeywords: plan.backgroundKeywords,
    imageKeywords: plan.imageKeywords,
    cameraMotion: plan.cameraMotion,
    accent: plan.accent,
    history,
    profileName: profile.personagem || profile.nomeFormato || "canal",
    scoreBias: history.dominant === mood ? 1.15 : 1,
  };
}

function analyzeChannelHistory(channelHistory = []) {
  const normalized = normalizeHistory(channelHistory);
  const history = analyzeHistoricVideos(normalized);

  const recommendation = {
    dominantMood: history.dominant,
    bestStyle: history.dominant === "radical"
      ? "conspiração / surpresa / caos"
      : history.dominant === "negative"
        ? "drama / crise / contraste forte"
        : history.dominant === "positive"
          ? "dica / impulso / sensação de ganho"
          : "impacto / notícia / investigação",
    shouldLean: history.dominant === "radical"
      ? ["gancho forte", "texto em caixote", "flash + contraste"]
      : history.dominant === "negative"
        ? ["problema + solução", "close-up emocional", "tom de urgência"]
        : history.dominant === "positive"
          ? ["energia positiva", "dica útil", "narrativa de progresso"]
          : ["investigação", "fato + efeito", "impacto visual"],
    confidence: normalized.length > 0 ? Math.min(95, 60 + normalized.length * 5) : 45,
    signalCount: normalized.length,
  };

  return { history, recommendation };
}

module.exports = { analyzeHistoricVideos, buildCreativePlan, analyzeChannelHistory, normalizeHistory };
