const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs/promises");
const { FORMATS } = require("./studioConfig");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true, cwd: options.cwd });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { proc.kill(); }, options.timeout || 10 * 60 * 1000);
    proc.stdout.on("data", data => { stdout = (stdout + data).slice(-2000000); });
    proc.stderr.on("data", data => { stderr = (stderr + data).slice(-4000); });
    proc.on("error", err => { clearTimeout(timer); reject(new Error(`${command} indisponível: ${err.message}`)); });
    proc.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} falhou (${code ?? "tempo limite"}): ${stderr.slice(-1500)}`));
    });
  });
}
async function probe(file) {
  const data = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { timeout: 30000 }));
  const video = data.streams?.find(s => s.codec_type === "video");
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error("O arquivo precisa conter um vídeo válido com duração conhecida.");
  if (video.width > 7680 || video.height > 7680) throw new Error("Resolução de entrada acima do limite de 7680 pixels.");
  return { duration, hasAudio: data.streams.some(s => s.codec_type === "audio"), width: video.width, height: video.height };
}
function ffmpeg(args, cwd) {
  return run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd });
}
const videoEncoding = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"];

async function extractClip(source, output, start, duration, info) {
  if (start >= info.duration) throw new Error("O início do trecho está depois do fim do vídeo.");
  const actual = Math.min(duration, info.duration - start);
  if (actual < 1) throw new Error("O trecho selecionado tem menos de 1 segundo.");
  const args = ["-ss", String(start), "-i", source];
  if (!info.hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-map", "0:v:0", "-map", info.hasAudio ? "0:a:0" : "1:a:0", "-t", String(actual),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=30", "-ar", "48000", "-ac", "2", ...videoEncoding, output);
  await ffmpeg(args);
  return { duration: actual, hasAudio: info.hasAudio };
}
async function joinScenes(scenes, output, workDir, ratio) {
  const width = ratio === "9:16" ? 720 : 1280;
  const height = ratio === "9:16" ? 1280 : 720;
  const normalized = [];
  let hasAudio = false;
  for (let i = 0; i < scenes.length; i++) {
    const info = await probe(scenes[i]);
    hasAudio ||= info.hasAudio;
    const target = path.join(workDir, `normalized-${i}.mp4`);
    const args = ["-i", scenes[i]];
    if (!info.hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    args.push("-map", "0:v:0", "-map", info.hasAudio ? "0:a:0" : "1:a:0", "-t", String(info.duration),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
      "-ar", "48000", "-ac", "2", ...videoEncoding, target);
    await ffmpeg(args);
    normalized.push(`file 'normalized-${i}.mp4'`);
  }
  await fs.writeFile(path.join(workDir, "scenes.txt"), normalized.join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "1", "-i", "scenes.txt", "-c", "copy", "-movflags", "+faststart", output], workDir);
  return { ...(await probe(output)), hasAudio };
}
async function extractAudio(source, output) {
  await ffmpeg(["-i", source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", output]);
}
function layout(format, template) {
  const { width, height } = FORMATS[format];
  if (template === "perfil") return format === "vertical"
    ? { x: 60, y: 500, w: 960, h: 1080, bg: "0xf5f5f5" }
    : { x: 240, y: 290, w: 1440, h: 720, bg: "0xf5f5f5" };
  if (template === "meme") return format === "vertical"
    ? { x: 0, y: 130, w: 1080, h: 1050, bg: "0x101016", image: { x: 0, y: 1410, w: 1080, h: 360 } }
    : { x: 0, y: 210, w: 1280, h: 720, bg: "0x101016", image: { x: 1280, y: 210, w: 640, h: 720 } };
  return { x: 0, y: 0, w: width, h: height, bg: "0x101016" };
}
async function renderVariant({ source, output, format, template, reactionPath, fit, assFile, workDir }) {
  const { width, height } = FORMATS[format];
  const box = layout(format, template);
  const sizing = fit === "cover"
    ? `scale=${box.w}:${box.h}:force_original_aspect_ratio=increase,crop=${box.w}:${box.h}`
    : `scale=${box.w}:${box.h}:force_original_aspect_ratio=decrease,pad=${box.w}:${box.h}:(ow-iw)/2:(oh-ih)/2:color=0x101016`;
  // Controlled relative filename avoids Windows drive-letter escaping in libass.
  if (!/^[a-z0-9-]+\.ass$/.test(assFile)) throw new Error("Nome de legenda inválido.");
  const args = ["-i", source];
  let filters = `[0:v]${sizing},pad=${width}:${height}:${box.x}:${box.y}:color=${box.bg},setsar=1,fps=30[base]`;
  if (box.image) {
    if (!reactionPath) throw new Error("Envie uma imagem para o template Clipe + imagem.");
    args.push("-i", reactionPath);
    const r = box.image;
    filters += `;[1:v]scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease,pad=${r.w}:${r.h}:(ow-iw)/2:(oh-ih)/2:color=0x101016,setsar=1[reaction];[base][reaction]overlay=${r.x}:${r.y}:eof_action=repeat[comp]`;
  } else filters += ";[base]null[comp]";
  filters += `;[comp]subtitles=filename=${assFile}[out]`;
  args.push("-filter_complex_threads", "1", "-filter_complex", filters, "-map", "[out]", "-map", "0:a:0", ...videoEncoding, output);
  await ffmpeg(args, workDir);
}
async function checkTools() {
  try {
    const filters = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-filters"], { timeout: 10000 });
    await run(process.env.FFPROBE_PATH || "ffprobe", ["-version"], { timeout: 10000 });
    if (!/\bsubtitles\b/.test(filters)) throw new Error("FFmpeg precisa do filtro subtitles (libass).");
    return { ready: true };
  } catch (e) { return { ready: false, error: e.message }; }
}
module.exports = { run, ffmpeg, probe, extractClip, joinScenes, extractAudio, renderVariant, checkTools, layout };
