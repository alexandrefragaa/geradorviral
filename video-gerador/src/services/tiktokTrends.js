const fetch = require("node-fetch");

const SEARCH_URL = "https://open.tiktokapis.com/v2/research/video/query/";
const FIELDS = [
  "id", "video_description", "create_time", "like_count", "comment_count",
  "share_count", "view_count", "cover_image_url", "duration", "username",
].join(",");

const CHARACTER_FORMATS = [
  ["Peter Griffin", ["Jornal do Peter", "Peter Conspira", "Peter Revela", "Peter Analisa", "Peter Explica"]],
  ["Rick Sanchez", ["Jornal do Rick", "Rick Conspira", "Rick Revela", "Rick Analisa", "Rick Explica"]],
  ["Cartman", ["Jornal do Cartman", "Cartman Conspira", "Cartman Revela", "Cartman Analisa", "Cartman Explica"]],
  ["Gumball", ["Jornal do Gumball", "Gumball Conspira", "Gumball Revela", "Gumball Analisa", "Gumball Explica"]],
];

const QUERY_DEFINITIONS = CHARACTER_FORMATS.flatMap(([character, formats]) =>
  formats.map((format) => ({ character, format, keyword: `${character} ${format}` }))
);

function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

async function searchQuery(definition, accessToken) {
  const response = await fetch(`${SEARCH_URL}?fields=${encodeURIComponent(FIELDS)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        and: [{ operation: "EQ", field_name: "keyword", field_values: [definition.keyword] }],
      },
      max_count: 20,
      start_date: dateDaysAgo(30),
      end_date: dateDaysAgo(0),
      is_random: false,
    }),
  });

  if (!response.ok) throw new Error(`TikTok Research API falhou (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (payload.error?.code && payload.error.code !== "ok") {
    throw new Error(`TikTok Research API: ${payload.error.message || payload.error.code}`);
  }

  return (payload.data?.videos || []).map((video) => ({
    id: video.id,
    titulo: video.video_description || definition.keyword,
    canal: video.username ? `@${video.username}` : "TikTok",
    publicadoEm: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
    thumbnail: video.cover_image_url,
    visualizacoes: Number(video.view_count || 0),
    curtidas: Number(video.like_count || 0),
    comentarios: Number(video.comment_count || 0),
    compartilhamentos: Number(video.share_count || 0),
    url: video.username ? `https://www.tiktok.com/@${video.username}/video/${video.id}` : `https://www.tiktok.com/` ,
    queryOrigem: definition.keyword,
    personagem: definition.character,
    formato: definition.format,
    plataforma: "tiktok",
  }));
}

async function fetchTikTokTrends() {
  const accessToken = String(process.env.TIKTOK_RESEARCH_ACCESS_TOKEN || "").trim();
  if (!accessToken) return { videos: [], status: "indisponivel: configure TIKTOK_RESEARCH_ACCESS_TOKEN" };

  const results = await Promise.all(QUERY_DEFINITIONS.map((definition) =>
    searchQuery(definition, accessToken).catch((error) => {
      console.error(`[tiktok] falha na busca "${definition.keyword}":`, error.message);
      return [];
    })
  ));
  const seen = new Set();
  const videos = results.flat().filter((video) => {
    if (seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  }).sort((a, b) => b.visualizacoes - a.visualizacoes).slice(0, 30);

  return { videos, status: "ativo" };
}

module.exports = { fetchTikTokTrends, QUERY_DEFINITIONS };