const fetch = require("node-fetch");

async function generateText(system, prompt, request = fetch) {
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!gemini && !anthropic) throw new Error("Configure GEMINI_API_KEY ou ANTHROPIC_API_KEY.");
  const response = await request(gemini
    ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    : "https://api.anthropic.com/v1/messages", {
    method: "POST", timeout: 120000,
    headers: gemini
      ? { "Content-Type": "application/json", "x-goog-api-key": gemini }
      : { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(gemini ? {
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
    } : { model: "claude-sonnet-4-6", max_tokens: 8192, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`API de texto respondeu HTTP ${response.status}. Verifique chave, saldo e modelo.`);
  const data = await response.json();
  const text = gemini ? data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") : data.content?.filter(p => p.type === "text").map(p => p.text).join("");
  if (!text?.trim()) throw new Error("A API de texto não retornou conteúdo. Tente outra descrição.");
  return text.trim();
}
module.exports = { generateText };
