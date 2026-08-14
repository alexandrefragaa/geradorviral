const { spawn } = require("child_process");
const path = require("path");

/**
 * Recorta o personagem da imagem de entrada (remove o fundo).
 * @param {string} inputPath  caminho da imagem original
 * @param {string} outputPath caminho de saída (PNG transparente)
 * @returns {Promise<string>} caminho do PNG gerado
 */
function cutoutCharacter(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "cutout.py");
    const proc = spawn("python3", [scriptPath, inputPath, outputPath]);

    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`cutout.py falhou (código ${code}): ${stderr}`));
      }
    });
  });
}

module.exports = { cutoutCharacter };
