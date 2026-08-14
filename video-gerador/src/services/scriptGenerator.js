const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const profiles = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../data/trendProfiles.json"), "utf-8")
);

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Gera um roteiro (hook/meio/CTA) no estilo de um canal de referência,
 * a partir de um tema. Usa o perfil de estilo (não copia roteiros reais).
 *
 * @param {string} channelKey  chave em data/trendProfiles.json (ex: 'peter_conspira')
 * @param {string} topic       tema/assunto do vídeo
 */
async function generateScript(channelKey, topic, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Preencha o .env (veja .env.example)."
    );
  }

  const { targetDuration = 60, variacoes = 1 } = options;

  const profile = profiles[channelKey];
  if (!profile) {
    throw new Error(
      `Perfil "${channelKey}" não encontrado. Opções: ${Object.keys(profiles).join(", ")}`
    );
  }

  // proporções das batidas do MFV (frações do tempo total), escaladas pro
  // targetDuration escolhido — 60s+ é o mínimo do TikTok pra monetizar
  // (Creator Rewards Program exige 1min+), 45s serve só pra alcance/crescimento
  const beat = (fracInicio, fracFim) => {
    const ini = Math.round(targetDuration * fracInicio);
    const fim = Math.round(targetDuration * fracFim);
    return `${ini}s-${fim}s`;
  };
  const monetizavel = targetDuration >= 60;

  const systemPrompt = `Você escreve roteiros virais de ~${targetDuration}s para vídeos "notícia" narrados
por um personagem de desenho animado com personalidade extremamente forte.

Personagem: ${profile.personagem} (arquétipo: ${profile.arquetipo})
Tom: ${profile.tom}
Temas típicos: ${profile.temas.join(", ")}
Bordão de identidade (use próximo do início): "${profile.bordao}"

Duração alvo: ~${targetDuration} segundos falados (aprox. ${Math.round(targetDuration * 2.6)} palavras
em ritmo rápido de fala). ${monetizavel ? "Esse comprimento (60s+) é o mínimo exigido pelo TikTok Creator Rewards Program pra monetizar." : "Atenção: abaixo de 60s o vídeo NÃO é elegível pra monetização no TikTok, só serve pra alcance/crescimento."}

Siga esta estrutura de batidas, escalada pra duração alvo:

[${beat(0, 0.033)}] IMPACTO IMEDIATO — uma frase forte, direta, emocional. Sem contexto, sem
explicação, só impacto (ex: "alerta vermelho", "isso acabou de acontecer"). PRECISA
parar o scroll da pessoa nos primeiros 3 segundos, ou o vídeo morre ali.

[${beat(0.033, 0.083)}] ABSURDO/CONSEQUÊNCIA — uma frase que aumenta a curiosidade com um número,
resultado ou consequência exagerada. A pessoa precisa pensar "preciso entender isso".

[${beat(0.083, 0.133)}] QUEBRA + BORDÃO — encaixe o bordão de identidade do personagem aqui.

[${beat(0.133, 0.333)}] CONTEXTO SIMPLIFICADO — explica o assunto em linguagem fácil, sem termos
técnicos, com comparação simples (ex: "o cara era tipo o Pablo Escobar II").

[${beat(0.333, 0.5)}] OPINIÃO FORTE — a personalidade do personagem aparece: crítica, deboche,
indignação, conforme o arquétipo dele.

[${beat(0.5, 0.75)}] PICOS DE EMOÇÃO — 2-4 frases curtas de alta intensidade espalhadas
(ex: "isso é absurdo", "tá tudo pegando fogo") pra não deixar o ritmo cair. Em roteiros
mais longos, insira 1-2 reviravoltas ou fatos novos aqui pra sustentar a curiosidade.

[${beat(0.75, 0.867)}] FECHAMENTO EM ABERTO — conclui sem encerrar 100%, deixando gancho pra
continuação ou dúvida. Termine com uma pergunta ou afirmação polêmica que puxe discordância
(ex: "será que foi certo?", "eu discordo completamente disso") — comentário hoje pesa mais
que curtida no algoritmo, então o objetivo é fazer a pessoa digitar uma resposta.

[${beat(0.867, 0.933)}] CTA 1 (crescimento): "${profile.cta1_crescimento}"

[${beat(0.933, 1)}] CTA 2 (monetização): "${profile.cta2_monetizacao}"

Regras gerais:
- Português do Brasil, gíria de rua, frases curtas e diretas, ritmo rápido
- Tom emocional, nunca robótico — soa como fala, não como texto formal
- Nunca fique "morno" por mais de 3 segundos seguidos — a pessoa precisa ter um motivo
  pra continuar assistindo em CADA trecho, do primeiro ao último segundo, senão ela sai
- O objetivo é a pessoa se divertir e ficar até o final: mantenha a curiosidade em
  aberto o tempo todo (nunca entregue tudo de uma vez) e só resolva no fechamento
- NUNCA copie falas de episódios reais do personagem nem roteiros de outros criadores —
  crie um texto 100% original nesse estilo
- Devolva só o texto do roteiro corrido, sem marcar os tempos/seções no output final`;

  const gerarUm = async () => {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: `Tema do vídeo: ${topic}` }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API falhou (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const textBlock = data.content.find((b) => b.type === "text");
    return textBlock ? textBlock.text.trim() : "";
  };

  if (variacoes <= 1) {
    return gerarUm();
  }
  // gera N variações (ex: pra testar formatos/ganchos diferentes, tipo A/B test)
  return Promise.all(Array.from({ length: variacoes }, gerarUm));
}

function listProfiles() {
  return Object.entries(profiles)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, p]) => ({ key, ...p }));
}

module.exports = { generateScript, listProfiles };
