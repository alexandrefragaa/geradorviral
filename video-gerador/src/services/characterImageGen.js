const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const FAL_URL = "https://fal.run/fal-ai/bytedance/seedream/v4/text-to-image";

const profiles = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../data/trendProfiles.json"), "utf-8")
);

function findCharacter(characterKey) {
  for (const arquetipo of Object.values(profiles._arquetiposDePersonagem)) {
    if (arquetipo.personagens[characterKey]) {
      return arquetipo.personagens[characterKey];
    }
  }
  return null;
}

/**
 * Gera a imagem do personagem, com roupa/cena adequada ao tema do roteiro.
 * @param {string} characterKey  chave do personagem (ex: 'peter_griffin')
 * @param {string} [outfitHint]  roupa específica (ex: "jaleco de cientista"). Se
 *                               vazio, deixa o modelo decidir com base na cena/tema.
 * @param {string} [sceneHint]   contexto/tema do vídeo, pra influenciar pose e expressão
 * @param {string} outputPath    caminho onde salvar o PNG gerado
 */
async function generateCharacterImage(characterKey, outfitHint, sceneHint, outputPath) {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY não configurada. Preencha o .env (veja .env.example).");
  }

  const character = findCharacter(characterKey);
  if (!character) {
    throw new Error(`Personagem "${characterKey}" não encontrado em data/trendProfiles.json`);
  }

  const roupa = outfitHint
    ? `vestindo ${outfitHint}`
    : sceneHint
    ? `com uma roupa que combine com o contexto: "${sceneHint}"`
    : "com a roupa clássica dele";

  const prompt =
    `Personagem de desenho animado 3D estilizado (estilo render tipo Pixar/DreamWorks), ` +
    `${character.descricaoVisual}, ${roupa}, corpo inteiro, pose expressiva de quem está ` +
    `narrando uma notícia chocante, fundo liso verde-chroma, iluminação de estúdio, ` +
    `alta qualidade, plano americano`;

  const response = await fetch(FAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({ prompt, image_size: "portrait_16_9" }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Seedream (fal.ai) falhou (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const imageUrl = data.images?.[0]?.url;
  if (!imageUrl) throw new Error("Seedream não devolveu imagem.");

  const imgRes = await fetch(imageUrl);
  const buffer = await imgRes.buffer();
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function listCharacters() {
  const out = [];
  for (const [arqKey, arquetipo] of Object.entries(profiles._arquetiposDePersonagem)) {
    for (const [key, p] of Object.entries(arquetipo.personagens)) {
      out.push({ key, arquetipo: arqKey, ...p });
    }
  }
  return out;
}

module.exports = { generateCharacterImage, listCharacters };
