const { fetchYoutubeTrends } = require("./youtubeTrends");

const REFRESH_MS = 5 * 60 * 1000; // 5 minutos

let cache = {
  youtube: [],
  tiktok: [],
  tiktokStatus: "indisponivel: TikTok Research API exige aprovacao",
  atualizadoEm: null,
  erro: null,
};

async function refresh() {
  try {
    const youtube = await fetchYoutubeTrends();
    cache = { youtube, atualizadoEm: new Date().toISOString(), erro: null };
    console.log(`[trends] atualizado — ${youtube.length} vídeos`);
  } catch (err) {
    cache = { ...cache, erro: err.message, atualizadoEm: new Date().toISOString() };
    console.error("[trends] erro ao atualizar:", err.message);
  }
}

function startTrendsRefresher() {
  refresh(); // primeira carga imediata ao subir o servidor
  setInterval(refresh, REFRESH_MS);
}

function getCachedTrends() {
  return cache;
}

module.exports = { startTrendsRefresher, getCachedTrends };
