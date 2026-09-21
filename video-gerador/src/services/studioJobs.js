const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const { FORMATS, TEMPLATES } = require("./studioConfig");
const { generateScene } = require("./sceneGenerator");
const { probe, extractClip, joinScenes, extractAudio, renderVariant } = require("./studioRender");
const { transcribeSegments, translateSegments, buildAss, buildSrt } = require("./studioCaptions");
const ROOT = path.join(__dirname, "../..");

async function processJob(job, update) {
  const { options: o, workDir, outputDir } = job;
  const source = path.join(workDir, "source.mp4");
  let info;
  if (o.mode === "ai") {
    const scenes = [];
    for (let i = 0; i < o.prompts.length; i++) {
      update({ stage: `Criando cena ${i + 1} de ${o.prompts.length}`, progress: 5 + Math.round(i / o.prompts.length * 35) });
      const scene = path.join(workDir, `scene-${i}.mp4`);
      await generateScene({ description: o.prompts[i], duration: o.sceneDuration, ratio: FORMATS[o.formats[0]].ratio, outputPath: scene,
        onSubmitted: request => update({ providerRequests: [...job.providerRequests, { scene: i + 1, ...request }] }) });
      scenes.push(scene);
    }
    update({ stage: "Montando as cenas", progress: 40 });
    info = await joinScenes(scenes, source, workDir, FORMATS[o.formats[0]].ratio);
  } else {
    update({ stage: "Preparando o trecho", progress: 10 });
    info = await extractClip(job.inputPath, source, o.start, o.duration, await probe(job.inputPath));
    if (info.duration < o.duration) update({ warnings: [...job.warnings, `O vídeo termina antes do tempo solicitado; o trecho tem ${info.duration.toFixed(1)} segundos.`] });
  }
  let segments = [];
  if (o.captionMode !== "none") {
    if (!info.hasAudio) throw new Error("Este vídeo não tem faixa de áudio. Gere novamente escolhendo Sem legendas.");
    update({ stage: "Transcrevendo a fala", progress: 45 });
    const audio = path.join(workDir, "speech.mp3");
    await extractAudio(source, audio);
    const transcript = await transcribeSegments(audio);
    segments = transcript.segments;
    if (!segments.length) update({ warnings: [...job.warnings, "Nenhuma fala reconhecida; o vídeo será exportado apenas com o título."] });
    if (segments.length && o.captionMode === "pt" && !/^(portuguese|pt|português)$/i.test(transcript.language)) {
      throw new Error("A fala não foi identificada como português. Escolha Traduzir para português para obter legendas em PT-BR.");
    }
    if (segments.length && o.captionMode === "translate" && !/^(portuguese|pt|português)$/i.test(transcript.language)) {
      update({ stage: "Traduzindo para português", progress: 55 });
      segments = await translateSegments(segments);
    }
    if (segments.length) {
      fs.writeFileSync(path.join(outputDir, "legendas-pt.srt"), buildSrt(segments, info.duration));
      update({ subtitleUrl: `/output/${job.id}/legendas-pt.srt` });
    }
  }
  const total = o.formats.length * o.headlines.length * o.templates.length;
  let index = 0;
  for (const template of o.templates) for (const headline of o.headlines) for (const format of o.formats) {
    update({ stage: `Renderizando vídeo ${index + 1} de ${total}`, progress: 60 + Math.floor(index / total * 38) });
    const assFile = `captions-${index}.ass`;
    fs.writeFileSync(path.join(workDir, assFile), buildAss({ segments, headline, duration: info.duration, format, template, ai: o.mode === "ai", creator: o.creator }));
    const fileName = index === 0 ? "final.mp4" : `variant-${index + 1}.mp4`;
    await renderVariant({ source, output: path.join(outputDir, fileName), format, template, fit: o.fit, reactionPath: job.reactionPath, assFile, workDir });
    update({ outputs: [...job.outputs, { fileName, url: `/output/${job.id}/${fileName}`, format, template, headline,
      label: `${TEMPLATES[template]} · ${FORMATS[format].label}`, duration: info.duration }] });
    index++;
  }
}

function createJobStore({ root = ROOT, worker = processJob } = {}) {
  const metadata = path.join(root, "data/studio-jobs");
  fs.mkdirSync(metadata, { recursive: true });
  const jobs = new Map();
  const queue = [];
  let running = false;
  const persist = job => {
    const target = path.join(metadata, `${job.id}.json`);
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(job, null, 2));
    fs.renameSync(`${target}.tmp`, target);
  };
  for (const file of fs.readdirSync(metadata).filter(f => /^[a-f0-9-]{36}\.json$/.test(f))) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(metadata, file), "utf8"));
      if (["queued", "running"].includes(job.status)) {
        job.status = "interrupted";
        job.stage = "Interrompido pelo reinício do servidor";
        job.error = "O servidor reiniciou. Os resultados concluídos foram preservados. Para cenas de IA, confira os requestIds no fal.ai antes de gerar novamente.";
        persist(job);
      }
      jobs.set(job.id, job);
    } catch (err) { console.error("[studio] Metadados inválidos:", file); }
  }
  const publicJob = job => ({ id: job.id, status: job.status, stage: job.stage, progress: job.progress,
    createdAt: job.createdAt, updatedAt: job.updatedAt, options: job.options, outputs: job.outputs, warnings: job.warnings,
    subtitleUrl: job.subtitleUrl, error: job.error, providerRequests: job.providerRequests.map(({ scene, requestId }) => ({ scene, requestId })) });
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      const update = change => { Object.assign(job, change, { updatedAt: new Date().toISOString() }); persist(job); };
      try {
        update({ status: "running", stage: "Iniciando", progress: 1 });
        await worker(job, update);
        update({ status: "completed", stage: "Vídeos prontos", progress: 100 });
        // Private originals are no longer needed once every variant has completed.
        await fs.promises.rm(job.workDir, { recursive: true, force: true });
      } catch (err) {
        // Partial MP4s are removed; successful variants stay downloadable.
        for (const file of fs.readdirSync(job.outputDir)) {
          if (file.endsWith(".mp4") && !job.outputs.some(o => o.fileName === file)) fs.unlinkSync(path.join(job.outputDir, file));
        }
        update({ status: "failed", stage: "Não foi possível concluir", error: err.message });
      }
    }
    running = false;
  }
  return {
    pending: () => queue.length + Number(running),
    get: id => jobs.has(id) ? publicJob(jobs.get(id)) : null,
    list: () => [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(publicJob),
    create(options, inputPath, reactionPath) {
      const id = uuid();
      const workDir = path.join(root, "uploads/studio", id), outputDir = path.join(root, "output", id);
      fs.mkdirSync(workDir, { recursive: true }); fs.mkdirSync(outputDir, { recursive: true });
      const move = (source, name) => {
        if (!source) return null;
        const target = path.join(workDir, name); fs.renameSync(source, target); return target;
      };
      const job = { id, options, workDir, outputDir, inputPath: move(inputPath, "input.video"), reactionPath: move(reactionPath, "reaction.image"),
        status: "queued", stage: "Na fila", progress: 0, outputs: [], warnings: [], providerRequests: [], createdAt: new Date().toISOString() };
      persist(job); jobs.set(id, job); queue.push(job);
      setImmediate(() => drain().catch(err => { running = false; console.error("[studio] Fila interrompida:", err.message); }));
      return publicJob(job);
    },
  };
}
module.exports = { createJobStore, processJob };
