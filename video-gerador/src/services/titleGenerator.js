const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function buildPrompt({ script, topic, channelKey, characterKey }) {
  return `Você é especialista em títulos virais para TikTok e YouTube Shorts em português do Brasil.
Responda APENAS com 1 título de até 100 caracteres — sem aspas, sem emoji, sem explicação, sem markdown.

Regras do título:
- Gancho de curiosidade real (baseado em algo específico que acontece no roteiro, não genérico)
- Nunca revela o final/a virada
- Tom "notícia proibida / bastidor / acorda pra isso", igual ao gancho do próprio roteiro
- Combina com o formato do canal "${channelKey || "genérico"}" e o personagem "${characterKey || "genérico"}"
- Português coloquial do Brasil

Tema do vídeo: ${topic || "(sem tema explícito — extraia do roteiro abaixo)"}

Roteiro final do vídeo:
"""
${script}
"""`;
}

/**
 * Gera um título curto e "clicável" a partir do roteiro final do vídeo.
 * Usa a mesma ANTHROPIC_API_KEY já configurada pra gerar o roteiro.
 *
 * @param {{script:string, topic?:string, channelKey?:string, characterKey?:string}} input
 * @param {{fetch?: typeof fetch}} deps - injeção de dependência pra testes (mesmo padrão do sceneGenerator)
 * @returns {Promise<string>}
 */
async function generateTitle({ script, topic, channelKey, characterKey }, { fetch: fetchImpl = fetch } = {}) {
  if (!script || !script.trim()) {
    throw new Error("Envie o roteiro (script) pra gerar o título.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY no .env pra gerar título com IA.");
  }

  const response = await fetchImpl(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 60,
      messages: [{ role: "user", content: buildPrompt({ script, topic, channelKey, characterKey }) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao gerar título (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const title = text
    .split("\n")[0]
    .replace(/^["“”']|["“”']$/g, "")
    .trim()
    .slice(0, 100);

  if (!title) {
    throw new Error("A IA não devolveu um título válido.");
  }
  return title;
}

module.exports = { generateTitle };