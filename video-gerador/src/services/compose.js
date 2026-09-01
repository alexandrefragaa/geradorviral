const ffmpeg = require("fluent-ffmpeg");

/**
 * Junta tudo num vídeo vertical final (1080x1920) com efeitos dinâmicos:
 * - um ou mais clipes de fundo, com transição (crossfade) entre eles
 * - zoom de câmera lento e contínuo no fundo (efeito Ken Burns)
 * - personagem recortado com "pop" de entrada (escala) + leve flutuação contínua
 * - legenda estilizada (.ass) queimada no vídeo
 * - voz + música de fundo (mais baixa, com fade)
 *
 * @param {object} opts
 * @param {string[]} opts.backgroundPaths  1+ vídeos de fundo (cortados/concatenados com transição)
 * @param {string} opts.characterPath      PNG do personagem já recortado
 * @param {string} opts.voicePath          áudio da voz gerada
 * @param {string} opts.subtitlesPath      arquivo .ass
 * @param {string} [opts.musicPath]        música de fundo opcional
 * @param {number} opts.duration           duração alvo (segundos) = duração da voz
 * @param {string} opts.outputPath         caminho do .mp4 final
 * @param {object} [opts.effects]          { zoom: true, transitionDuration: 0.6, characterPop: true }
 */
function composeVideo(opts) {
  const {
    backgroundPaths,
    characterPath,
    voicePath,
    subtitlesPath,
    musicPath,
    duration,
    outputPath,
    effects = {},
  } = opts;

  const {
    zoom = true,
    transitionDuration = 0.6,
    characterPop = true,
    filterPreset = "",
    musicVolume = 0.12,
  } = effects;
  const bgClips = Array.isArray(backgroundPaths) ? backgroundPaths : [backgroundPaths];

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    const segmentDuration = duration / bgClips.length;

    bgClips.forEach((clip) => {
      command.input(clip).inputOptions(["-stream_loop", "-1"]);
    });
    const charIndex = bgClips.length;
    const voiceIndex = bgClips.length + 1;
    const musicIndex = bgClips.length + 2;

    command.input(characterPath);
    command.input(voicePath);
    if (musicPath) command.input(musicPath);

    const filters = [];

    // 1) prepara cada clipe de fundo: crop 1080x1920 + corta no tamanho do segmento
    bgClips.forEach((_, i) => {
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
          `trim=duration=${segmentDuration + (i < bgClips.length - 1 ? transitionDuration : 0)},` +
          `setpts=PTS-STARTPTS,fps=30[bgseg${i}]`
      );
    });

    // 2) concatena os segmentos com crossfade (xfade) quando houver mais de um
    let bgLabel;
    if (bgClips.length === 1) {
      bgLabel = "bgseg0";
    } else {
      let prev = "bgseg0";
      for (let i = 1; i < bgClips.length; i++) {
        const offset = segmentDuration * i - transitionDuration * i;
        const out = `xf${i}`;
        filters.push(
          `[${prev}][bgseg${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[${out}]`
        );
        prev = out;
      }
      bgLabel = prev;
    }

    // 3) zoom de câmera lento contínuo (Ken Burns) no fundo já composto
    if (zoom) {
      filters.push(
        `[${bgLabel}]zoompan=z='min(zoom+0.0006,1.15)':d=1:s=1080x1920:fps=30[bgzoom]`
      );
      bgLabel = "bgzoom";
    }
    filters.push(`[${bgLabel}]trim=duration=${duration},setpts=PTS-STARTPTS[bg]`);

    // 4) personagem: "pop" de entrada (0->1 no primeiro 0.4s) + flutuação leve contínua
    const popExpr = characterPop
      ? `if(lt(t,0.4),0.85+0.15*(t/0.4),1)*(1+0.015*sin(2*PI*t/2))`
      : `1+0.015*sin(2*PI*t/2)`;
    filters.push(
      `[${charIndex}:v]scale=760:-1,format=rgba,` +
        `scale=w='760*(${popExpr})':h=-1:eval=frame[char]`
    );
    filters.push(`[bg][char]overlay=(W-w)/2:H-h-40:eval=frame[comp]`);
    const finalVideoFilter = filterPreset ? `${filterPreset},` : "";
    filters.push(`[comp]${finalVideoFilter}ass=${subtitlesPath}[final]`);

    const audioMaps = musicPath
      ? [
          `[${voiceIndex}:a]volume=1.0[voice]`,
          `[${musicIndex}:a]volume=${musicVolume},afade=t=out:st=${Math.max(duration - 1, 0)}:d=1[music]`,
          `[voice][music]amix=inputs=2:duration=first[aout]`,
        ]
      : [`[${voiceIndex}:a]volume=1.0[aout]`];

    command
      .complexFilter([...filters, ...audioMaps])
      .outputOptions([
        "-map [final]",
        "-map [aout]",
        "-t",
        String(duration),
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-c:a aac",
        "-shortest",
      ])
      .output(outputPath)
      .on("start", (cmd) => console.log("[ffmpeg]", cmd))
      .on("error", (err) => reject(err))
      .on("end", () => resolve(outputPath))
      .run();
  });
}

module.exports = { composeVideo };
