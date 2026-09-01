const fetch = require("node-fetch");

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

const CHARACTER_FORMATS = [
  ["Peter Griffin", ["Jornal do Peter", "Peter Conspira", "Peter Revela", "Peter Analisa", "Peter Explica"]],
  ["Rick Sanchez", ["Jornal do Rick", "Rick Conspira", "Rick Revela", "Rick Analisa", "Rick Explica"]],
  ["Cartman", ["Jornal do Cartman", "Cartman Conspira", "Cartman Revela", "Cartman Analisa", "Cartman Explica"]],
  ["Gumball", ["Jornal do Gumball", "Gumball Conspira", "Gumball Revela", "Gumball Analisa", "Gumball Explica"]],
];

const FORMAT_SEARCH_TERMS = {
  Jornal: "noticia atual comentario",
  Conspira: "teoria segredo conspiracao",
  Revela: "curiosidades fatos desconhecidos revelacao",
  Analisa: "analise serie filme comportamento",
  Explica: "explicacao ciencia tecnologia como funciona",
};

const QUERY_DEFINITIONS = CHARACTER_FORMATS.flatMap(([character, formats]) =>
  formats.map((format) => ({
    query: `${character} ${format} ${FORMAT_SEARCH_TERMS[format.split(" ").pop()] || ""}`,
    character,
    format,
  }))
);
const QUERIES = QUERY_DEFINITIONS.map((item) => item.query);

async function searchQuery(definition, apiKey) {
  const { query, character, format } = definition;
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
    personagem: character,
    formato: format,
    plataforma: "youtube",
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
    QUERY_DEFINITIONS.map((definition) => searchQuery(definition, apiKey).catch((err) => {
      console.error(`Falha na busca "${definition.query}":`, err.message);
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

module.exports = { fetchYoutubeTrends, QUERIES, QUERY_DEFINITIONS };
