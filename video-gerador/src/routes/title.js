const express = require("express");
const { generateTitle } = require("../services/titleGenerator");

const router = express.Router();

// POST /generate-title  { script, topic?, channelKey?, characterKey? } -> { title }
router.post("/generate-title", async (req, res) => {
  try {
    const { script, topic, channelKey, characterKey } = req.body || {};
    const title = await generateTitle({ script, topic, channelKey, characterKey });
    res.json({ title });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;