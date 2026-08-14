const fetch = require("node-fetch");

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

// termos de busca por personagem/nicho — ajuste/adicione à vontade
const QUERIES = [
  "Peter Griffin notícia conspiração",
  "Cartman notícia viral",
  "Rick Sanchez conspiração",
  "Stewie Griffin notícia",
  "Gumball notícia investigativa",
  "Bojack Horseman notícia",
];

async function searchQuery(query, apiKey) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const searchParams = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    order: "viewCount",
    publishedAfter: thirtyDaysAgo,
    maxResults: "10",
    key: apiKey,
  });

  const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
  if (!searchRes.ok) {
    throw new Error(`YouTube search falhou (${searchRes.status}): ${await searchRes.text()}`);
  }
  const searchData = await searchRes.json();
  const ids = (searchData.items || []).map((it) => it.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  // search.list não devolve view count — busca as estatísticas de verdade
  const videosParams = new URLSearchParams({
    part: "statistics,snippet",
    id: ids.join(","),
    key: apiKey,
  });
  const videosRes = await fetch(`${VIDEOS_URL}?${videosParams}`);
  if (!videosRes.ok) {
    throw new Error(`YouTube videos falhou (${videosRes.status}): ${await videosRes.text()}`);
  }
  const videosData = await videosRes.json();

  return (videosData.items || []).map((v) => ({
    id: v.id,
    titulo: v.snippet.title,
    canal: v.snippet.channelTitle,
    publicadoEm: v.snippet.publishedAt,
    thumbnail: v.snippet.thumbnails?.medium?.url,
    visualizacoes: Number(v.statistics.viewCount || 0),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    queryOrigem: query,
  }));
}

/**
 * Busca os vídeos em alta (últimos 30 dias) pra cada termo configurado,
 * junta tudo, remove duplicado e ordena por visualizações.
 */
async function fetchYoutubeTrends() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY não configurada. Preencha o .env (veja .env.example).");
  }

  const resultsPerQuery = await Promise.all(
    QUERIES.map((q) => searchQuery(q, apiKey).catch((err) => {
      console.error(`Falha na busca "${q}":`, err.message);
      return [];
    }))
  );

  const seen = new Set();
  const merged = [];
  for (const list of resultsPerQuery) {
    for (const video of list) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      merged.push(video);
    }
  }

  merged.sort((a, b) => b.visualizacoes - a.visualizacoes);
  return merged.slice(0, 30);
}

module.exports = { fetchYoutubeTrends, QUERIES };
