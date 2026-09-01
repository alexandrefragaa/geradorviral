const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const profiles = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../data/trendProfiles.json"), "utf-8")
);

const archetypes = profiles._arquetiposDePersonagem || {};
const formatTemplates = [
  { key: "jornal", label: "Jornal", tone: "notícia rápida, urgente e comentada", themes: ["notícias", "fatos", "assuntos do momento"] },
  { key: "conspira", label: "Conspira", tone: "teorias, segredos e perguntas desconfortáveis", themes: ["segredos", "teorias", "o que ninguém conta"] },
  { key: "revela", label: "Revela", tone: "revelações surpreendentes sobre coisas que as pessoas não sabem", themes: ["curiosidades", "fatos desconhecidos", "descobertas"] },
  { key: "analisa", label: "Analisa", tone: "análise crítica de séries, vídeos, notícias e comportamentos", themes: ["análise", "séries", "filmes", "comportamento"] },
  { key: "explica", label: "Explica", tone: "explicação simples, visual e engraçada de assuntos complexos", themes: ["explicação", "como funciona", "ciência", "tecnologia"] },
];

Object.entries(archetypes).forEach(([arquetipo, archetype]) => {
  Object.entries(archetype.personagens || {}).forEach(([characterKey, character]) => {
    formatTemplates.forEach((format) => {
      const profileKey = `${format.key}_${characterKey}`;
      if (profiles[profileKey]) return;
      const displayName = character.nome.split(/\s+/)[0];
      const formatName = format.key === "jornal"
        ? `Jornal do ${displayName}`
        : `${displayName} ${format.label}`;
      if (format.key === "jornal" && Object.values(profiles).some((profile) =>
        profile.personagemKey === characterKey && profile.nomeFormato === formatName
      )) return;
      profiles[profileKey] = {
        personagem: character.nome,
        arquetipo,
        personagemKey: characterKey,
        nomeFormato: formatName,
        tom: `${format.tone}; ${archetype.descricao}`,
        temas: format.themes,
        bordao: `Se voce nao esta sabendo de nada, ja se prepara que vai comecar o ${formatName}`,
        cta1_crescimento: `segue o ${formatName}`,
        cta2_monetizacao: "segue para nao perder a proxima descoberta",
      };
    });
  });
});
const hookData = profiles._ganchos || {};
const ganchosAbertura = hookData.ganchosAbertura || [];
const bordaoTemplates = {
  condicoes: hookData.condicionais || [],
  chamadas: hookData.formatosVerbo || [],
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function sorteiaAlguns(lista, n) {
  const copia = [...lista];
  const escolhidos = [];
  for (let i = 0; i < n && copia.length > 0; i++) {
    const idx = Math.floor(Math.random() * copia.length);
    escolhidos.push(copia.splice(idx, 1)[0]);
  }
  return escolhidos;
}

function montaBordao(personagem) {
  const condicao = sorteiaAlguns(bordaoTemplates.condicoes, 1)[0];
  const chamada = sorteiaAlguns(bordaoTemplates.chamadas, 1)[0];
  if (!condicao || !chamada) return null;
  return `${condicao}, ${chamada.replace("{palavrao}", "merda").replace("{PERSONAGEM}", personagem)}`;
}

/**
 * Gera um roteiro (hook/meio/CTA) no estilo de um canal de referência,
 * a partir de um tema. Usa o perfil de estilo (não copia roteiros reais).
 *
 * @param {string} channelKey  chave em data/trendProfiles.json (ex: 'peter_conspira')
 * @param {string} topic       tema/assunto do vídeo
 */
async function generateScript(channelKey, topic, options = {}) {
  const geminiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  const provider = geminiKey ? "gemini" : anthropicKey ? "anthropic" : null;
  const apiKey = geminiKey || anthropicKey;
  if (!apiKey) {
    throw new Error(
      "Nenhuma API de roteiro configurada. Adicione GEMINI_API_KEY (recomendado) no .env ou no Render."
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

  const gerarUm = async () => {
    // sorteia uma abertura "nível Deus" diferente por chamada (pra variações não saírem iguais)
    const aberturasSorteadas = sorteiaAlguns(ganchosAbertura, 3);
    const bordaoVariado = montaBordao(profile.personagem) || profile.bordao;

    const systemPrompt = `Você escreve roteiros virais de ~${targetDuration}s para vídeos "notícia" narrados
por um personagem de desenho animado com personalidade extremamente forte.

Personagem: ${profile.personagem} (arquétipo: ${profile.arquetipo})
Tom: ${profile.tom}
Temas típicos: ${profile.temas.join(", ")}

Duração alvo: ~${targetDuration} segundos falados (aprox. ${Math.round(targetDuration * 2.6)} palavras
em ritmo rápido de fala). ${monetizavel ? "Esse comprimento (60s+) é o mínimo exigido pelo TikTok Creator Rewards Program pra monetizar." : "Atenção: abaixo de 60s o vídeo NÃO é elegível pra monetização no TikTok, só serve pra alcance/crescimento."}

Siga esta estrutura de batidas, escalada pra duração alvo:

[${beat(0, 0.033)}] IMPACTO IMEDIATO — a PRIMEIRA palavra ou expressão do vídeo, sempre. Escolha
UMA dessas opções (ou uma variação bem próxima no mesmo espírito), nunca invente uma diferente:
${aberturasSorteadas.map((g) => `"${g}"`).join(", ")}
Sem contexto, sem explicação antes dela — é a primeira coisa que sai da boca do personagem.

[${beat(0.033, 0.083)}] ABSURDO/CONSEQUÊNCIA — uma frase que aumenta a curiosidade com um número,
resultado ou consequência exagerada. A pessoa precisa pensar "preciso entender isso".

[${beat(0.083, 0.133)}] QUEBRA + BORDÃO — encaixe esta frase (ou adapte levemente mantendo a
mesma estrutura "condição + já se prepara que vai começar..."): "${bordaoVariado}"

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

    const response = provider === "gemini"
      ? await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: `Tema do vídeo: ${topic}` }] }],
          generationConfig: { maxOutputTokens: 700, temperature: 0.9 },
        }),
      })
      : await fetch(ANTHROPIC_URL, {
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
      throw new Error(`${provider === "gemini" ? "Gemini" : "Anthropic"} API falhou (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (provider === "gemini") {
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    }
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

function analyzeScript(script, profile = null) {
  const text = String(script || "").trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  if (!text) {
    return {
      score: 0,
      isMagnetic: false,
      isViral: false,
      summary: "Roteiro vazio. Adicione gancho, conflito e CTA para virar conteúdo magnético.",
      checks: []
    };
  }

  const hookPatterns = [
    "olha", "segura", "agora sim", "ninguém", "finalmente", "pare tudo",
    "você não vai acreditar", "isso aqui", "não acredito", "isso é absurdo",
    "tá tudo pegando fogo", "vazou"
  ];

  const curiosityPatterns = [
    "segredo", "verdade", "algoritmo", "mídia", "sociedade", "controle", "teoria",
    "sistema", "realidade", "vazou", "absurdo", "polêmica", "notícia", "mistério",
    "exclusivo", "vai te deixar sem chão", "isso foi"
  ];

  const emotionalPatterns = [
    "absurdo", "incrível", "caos", "pegando fogo", "ninguém", "só", "fez isso",
    "não pode", "não acredito", "reviravolta", "foram pegos", "desgraça", "quase"
  ];

  const ctaPatterns = ["segue", "salva", "compartilha", "comenta", "link na bio", "próxima parte"];

  const hookScore = hookPatterns.filter((pattern) => lower.includes(pattern)).length * 10;
  const curiosityScore = curiosityPatterns.filter((pattern) => lower.includes(pattern)).length * 8;
  const emotionalScore = emotionalPatterns.filter((pattern) => lower.includes(pattern)).length * 7;
  const ctaScore = ctaPatterns.filter((pattern) => lower.includes(pattern)).length * 8;
  const tempoScore = words.length >= 80 && words.length <= 220 ? 18 : words.length > 220 ? 12 : 8;
  const perguntaScore = /\?/.test(text) ? 10 : 0;

  const personaScore = profile && profile.personagem ? 10 : 0;
  const structureScore = /^(olha|segura|agora|finalmente|ninguém|pare tudo|isso)/i.test(text) ? 10 : 0;

  const total = Math.min(
    100,
    hookScore + curiosityScore + emotionalScore + ctaScore + tempoScore + perguntaScore + personaScore + structureScore
  );
  const isMagnetic = total >= 62;
  const isViral = total >= 78 && (hookScore >= 10 || perguntaScore >= 10);

  const checks = [
    {
      label: "gancho forte",
      ok: hookScore >= 10,
      detail: hookPatterns.filter((p) => lower.includes(p)).slice(0, 3).join(", ") || "Sem gatilho de impacto inicial"
    },
    {
      label: "curiosidade/ruptura",
      ok: curiosityScore >= 15,
      detail: curiosityPatterns.filter((p) => lower.includes(p)).slice(0, 3).join(", ") || "Sem gatilhos de curiosidade"
    },
    {
      label: "ritmo e retenção",
      ok: words.length >= 80 && words.length <= 220,
      detail: `${words.length} palavras`
    },
    {
      label: "CTA e reação",
      ok: ctaScore >= 8 || /segue|comenta|salva|compartilha/i.test(text),
      detail: ctaPatterns.filter((p) => lower.includes(p)).slice(0, 3).join(", ") || "Sem CTA final claro"
    }
  ];

  const summary = isViral
    ? "Roteiro forte e com potencial viral: tem gancho, curiosidade, emoção e CTA claro."
    : isMagnetic
    ? "Roteiro magnético, mas ainda precisa de mais impacto no início ou maior tensão para ser viral."
    : "Roteiro sem a tensão e retenção suficientes para ser considerado magnético/viral.";

  return {
    score: Math.round(total),
    isMagnetic,
    isViral,
    summary,
    checks,
    profile: profile ? profile.personagem || profile.nomeFormato || null : null,
    wordCount: words.length
  };
}

module.exports = { generateScript, listProfiles, analyzeScript };