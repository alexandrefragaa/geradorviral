const fs = require("fs");

function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(5, "0")}`;
}

/**
 * Monta um arquivo .ass com legenda estilo "palavra em destaque" (padrão TikTok),
 * a partir de uma lista [{word, start, end}].
 *
 * @param {Array<{word:string,start:number,end:number}>} words
 * @param {string} outputPath
 * @param {object} style { fontSize, fontColor, highlightColor, position }
 */
function buildStyledSubtitles(words, outputPath, style = {}) {
  const {
    fontSize = 72,
    fontColor = "&H00FFFFFF", // branco
    highlightColor = "&H0000D7FF", // amarelo/laranja em destaque
    fontName = "Arial Black",
    marginV = 260, // distância da base (posição da legenda no vídeo)
  } = style;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${fontColor},${highlightColor},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = words
    .map((w) => {
      const start = toAssTime(w.start);
      const end = toAssTime(w.end);
      // palavra atual em destaque (cor + leve zoom), sincronizada com a fala
      const text = `{\\c${highlightColor}\\t(0,80,\\fscx110\\fscy110)\\t(80,160,\\fscx100\\fscy100)}${w.word.toUpperCase()}`;
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  fs.writeFileSync(outputPath, header + events);
  return outputPath;
}

module.exports = { buildStyledSubtitles };
