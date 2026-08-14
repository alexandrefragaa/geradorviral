const fetch = require("node-fetch");

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Publica um Reel no Instagram via Graph API (o vídeo precisa estar numa URL pública).
 * @param {string} videoPublicUrl  URL pública do .mp4
 * @param {string} caption
 */
async function publishToInstagram(videoPublicUrl, caption) {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_USER_ID;
  if (!accessToken || !igUserId) {
    throw new Error("Faltam INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID no .env.");
  }

  // 1) cria o container
  const containerRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoPublicUrl,
      caption,
      share_to_feed: "true",
      access_token: accessToken,
    }),
  });
  if (!containerRes.ok)
    throw new Error(`Instagram (criar container) falhou: ${await containerRes.text()}`);
  const container = await containerRes.json();

  // 2) espera processar (poll — recomendado 1x/min por até 5min, aqui simplificado)
  let status = "IN_PROGRESS";
  for (let i = 0; i < 20 && status !== "FINISHED"; i++) {
    await sleep(6000);
    const statusRes = await fetch(
      `${GRAPH_BASE}/${container.id}?fields=status_code&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    status = statusData.status_code;
    if (status === "ERROR") throw new Error("Instagram: processamento do vídeo falhou.");
  }
  if (status !== "FINISHED") throw new Error("Instagram: timeout esperando o vídeo processar.");

  // 3) publica
  const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
  });
  if (!publishRes.ok) throw new Error(`Instagram (publicar) falhou: ${await publishRes.text()}`);
  const published = await publishRes.json();

  return { mediaId: published.id };
}

module.exports = { publishToInstagram };
