const fetch = require("node-fetch");

const INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

/**
 * Publica um vídeo no TikTok via PULL_FROM_URL (o vídeo precisa estar hospedado
 * num domínio público e verificado no TikTok Developer Portal).
 * @param {string} videoPublicUrl  URL pública do .mp4 (domínio verificado)
 * @param {string} title
 */
async function publishToTikTok(videoPublicUrl, title) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("TIKTOK_ACCESS_TOKEN não configurado no .env.");
  }

  const initRes = await fetch(INIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoPublicUrl,
      },
    }),
  });

  if (!initRes.ok) throw new Error(`TikTok init falhou (${initRes.status}): ${await initRes.text()}`);
  const initData = await initRes.json();
  const publishId = initData.data.publish_id;

  return { publishId, status: "iniciado — use checkTikTokStatus(publishId) pra acompanhar" };
}

async function checkTikTokStatus(publishId) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const res = await fetch(STATUS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  if (!res.ok) throw new Error(`TikTok status falhou (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.data; // { status: 'PROCESSING' | 'PUBLISH_COMPLETE' | 'FAILED' | ... }
}

module.exports = { publishToTikTok, checkTikTokStatus };
