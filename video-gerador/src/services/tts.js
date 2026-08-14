const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const FISH_AUDIO_URL = "https://api.fish.audio/v1/tts";
const voices = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../data/voices.json"), "utf-8")
);

/**
 * Gera áudio a partir do roteiro usando a voz do personagem escolhido (Fish Audio).
 * @param {string} script     texto do roteiro
 * @param {string} voiceKey   chave em data/voices.json (ex: 'peter_griffin')
 * @param {string} outputPath caminho onde salvar o .mp3
 */
async function generateVoice(script, voiceKey, outputPath) {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FISH_AUDIO_API_KEY não configurada. Preencha o .env (veja .env.example)."
    );
  }

  const voice = voices[voiceKey];
  if (!voice) {
    throw new Error(
      `Voz "${voiceKey}" não encontrada. Opções: ${Object.keys(voices).join(", ")}`
    );
  }
  if (!voice.referenceId) {
    throw new Error(
      `Voz "${voiceKey}" (${voice.nome}) ainda não tem referenceId preenchido em data/voices.json. ` +
        `Procure a voz do personagem na biblioteca do Fish Audio (fish.audio) ou clone a própria ` +
        `com áudio de referência, e cole o ID ali.`
    );
  }

  const response = await fetch(FISH_AUDIO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      model: "s2.1-pro",
    },
    body: JSON.stringify({
      text: script,
      reference_id: voice.referenceId,
      format: "mp3",
      prosody: { speed: 1.05, volume: 0 }, // levemente mais rápido = mais dinâmico
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fish Audio falhou (${response.status}): ${errText}`);
  }

  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function listVoices() {
  return Object.entries(voices).map(([key, v]) => ({ key, ...v }));
}

module.exports = { generateVoice, listVoices };
