const fetch = require("node-fetch");
const fs = require("fs");
const FormData = require("form-data");

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Transcreve o áudio e devolve palavras com timestamp (pra legenda sincronizada).
 * @param {string} audioPath caminho do .mp3/.wav gerado pelo TTS
 * @returns {Promise<Array<{word: string, start: number, end: number}>>}
 */
async function transcribeWithTimestamps(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Preencha o .env (veja .env.example)."
    );
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper falhou (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.words || [];
}

module.exports = { transcribeWithTimestamps };
