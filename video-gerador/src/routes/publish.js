const express = require("express");
const path = require("path");
const fs = require("fs");

const { publishToYouTube } = require("../services/publishers/youtube");
const { publishToTikTok } = require("../services/publishers/tiktok");
const { publishToInstagram } = require("../services/publishers/instagram");

const router = express.Router();

// POST /publish/:jobId  { platforms: ["youtube","tiktok","instagram"], title, caption }
router.post("/publish/:jobId", express.json(), async (req, res) => {
  const { jobId } = req.params;
  const { platforms = [], title = "", caption = "" } = req.body;

  const videoPath = path.join(__dirname, "../../output", jobId, "final.mp4");
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: `Vídeo do job ${jobId} não encontrado.` });
  }

  const publicBase = process.env.PUBLIC_BASE_URL;
  const videoPublicUrl = publicBase ? `${publicBase}/output/${jobId}/final.mp4` : null;

  const results = {};

  if (platforms.includes("youtube")) {
    try {
      results.youtube = await publishToYouTube(videoPath, title, caption);
    } catch (err) {
      results.youtube = { error: err.message };
    }
  }

  if (platforms.includes("tiktok")) {
    if (!videoPublicUrl) {
      results.tiktok = { error: "PUBLIC_BASE_URL não configurada — TikTok precisa de uma URL pública." };
    } else {
      try {
        results.tiktok = await publishToTikTok(videoPublicUrl, title);
      } catch (err) {
        results.tiktok = { error: err.message };
      }
    }
  }

  if (platforms.includes("instagram")) {
    if (!videoPublicUrl) {
      results.instagram = { error: "PUBLIC_BASE_URL não configurada — Instagram precisa de uma URL pública." };
    } else {
      try {
        results.instagram = await publishToInstagram(videoPublicUrl, caption);
      } catch (err) {
        results.instagram = { error: err.message };
      }
    }
  }

  res.json(results);
});

module.exports = router;
