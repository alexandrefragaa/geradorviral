const fetch = require("node-fetch");
const fs = require("fs");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

/**
 * Troca o refresh token por um access token novo (OAuth2 do Google).
 */
async function getAccessToken() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error(
      "Faltam YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN no .env."
    );
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar token do YouTube: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

/**
 * Publica um vídeo como YouTube Short (vertical, <=60s, com #Shorts no título).
 * @param {string} videoPath  caminho local do .mp4
 * @param {string} title      título do vídeo
 * @param {string} description
 */
async function publishToYouTube(videoPath, title, description) {
  const accessToken = await getAccessToken();

  const metadata = {
    snippet: {
      title: title.includes("#Shorts") ? title : `${title} #Shorts`,
      description,
      categoryId: "24", // Entertainment
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };

  const boundary = "videoGeradorBoundary";
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;
  const videoHeader = `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const videoBuffer = fs.readFileSync(videoPath);
  const body = Buffer.concat([
    Buffer.from(metaPart, "utf-8"),
    Buffer.from(videoHeader, "utf-8"),
    videoBuffer,
    Buffer.from(closing, "utf-8"),
  ]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  });

  if (!res.ok) throw new Error(`YouTube upload falhou (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return { videoId: data.id, url: `https://youtube.com/shorts/${data.id}` };
}

module.exports = { publishToYouTube };
