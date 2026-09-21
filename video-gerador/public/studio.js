(() => {
  'use strict';
  const el = id => document.getElementById('studio-' + id);
  const form = el('form');
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(n => n.value);
  let config, activeId, pollTimer, sourceUrl, reactionUrl, lastOutputKey = '', sending = false;
  const json = async (url, options) => {
    const res = await fetch(url, options);
    let data;
    try { data = await res.json(); } catch { throw new Error('Não foi possível ler a resposta do servidor. Confira se ele está rodando.'); }
    if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
    return data;
  };
  function updateForm() {
    const ai = checked('mode')[0] === 'ai';
    el('recycle').hidden = ai; el('ai').hidden = !ai;
    el('video').required = !ai; el('video').disabled = ai;
    el('prompts').required = ai; el('prompts').disabled = !ai;
    const templates = checked('templates');
    el('profile-options').hidden = !templates.includes('perfil');
    el('reaction-options').hidden = !templates.includes('meme');
    el('reaction').required = templates.includes('meme'); el('reaction').disabled = !templates.includes('meme');
    const headlines = el('headlines').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const count = Math.max(1, headlines.length) * checked('formats').length * templates.length;
    el('summary').textContent = `${count} vídeo${count === 1 ? '' : 's'} ${count === 1 ? 'será exportado' : 'serão exportados'}.` + (ai ? ` ${el('prompts').value.split(/\r?\n/).filter(s => s.trim()).length} cena(s) de ${el('scene-duration').value}s com cobrança no provedor.` : '');
    el('preview-headline').textContent = headlines[0] || 'Seu título em português';
    el('preview-creator').textContent = el('creator').value || 'Meu canal';
    el('mockup').dataset.template = el('preview-template').value;
    el('source-preview').style.objectFit = el('fit').value;
    el('source-preview').hidden = ai || !sourceUrl;
    el('empty-preview').hidden = !ai && Boolean(sourceUrl);
    const missing = [];
    if (config) {
      if (!config.tools.ready) missing.push('FFmpeg/FFprobe indisponível');
      if (ai && !config.capabilities.video) missing.push('FAL_API_KEY');
      if ((ai || el('captions').value === 'translate') && !config.capabilities.text) missing.push('GEMINI_API_KEY ou ANTHROPIC_API_KEY');
      if (el('captions').value !== 'none' && !config.capabilities.transcription) missing.push('OPENAI_API_KEY');
    }
    el('submit').disabled = sending || !config || missing.length > 0;
    el('config').textContent = !config ? 'Verificando os recursos disponíveis…' : missing.length
      ? `Para este modo, configure: ${missing.join(' · ')}. Salve no .env e reinicie o servidor. Reaproveitar sem legendas não usa APIs de IA.`
      : 'Recursos necessários configurados. O reaproveitamento sem legendas roda localmente. Cenas e legendas por IA usam suas contas de API.';
  }
  form.addEventListener('input', updateForm);
  form.addEventListener('change', event => {
    if (event.target.name === 'templates' && event.target.checked) el('preview-template').value = event.target.value;
    updateForm();
  });
  el('video').addEventListener('change', () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = el('video').files[0] ? URL.createObjectURL(el('video').files[0]) : null;
    el('source-preview').removeAttribute('src');
    if (sourceUrl) el('source-preview').src = sourceUrl;
    updateForm();
  });
  el('reaction').addEventListener('change', () => {
    if (reactionUrl) URL.revokeObjectURL(reactionUrl);
    reactionUrl = el('reaction').files[0] ? URL.createObjectURL(el('reaction').files[0]) : null;
    if (reactionUrl) el('reaction-preview').src = reactionUrl;
    el('reaction-preview').hidden = !reactionUrl; el('reaction-empty').hidden = Boolean(reactionUrl);
  });
  function showJob(job) {
    el('active').hidden = false;
    el('job-status').textContent = job.stage;
    el('progress').value = job.progress;
    el('job-error').textContent = (job.error || '') + (job.error && job.providerRequests.length ? '\nPedidos no fal.ai: ' + job.providerRequests.map(r => r.requestId).join(', ') : '');
    el('job-warnings').textContent = (job.warnings || []).join(' ');
    const outputKey = job.id + ':' + job.outputs.length;
    if (lastOutputKey !== outputKey) {
      lastOutputKey = outputKey; el('results').replaceChildren();
      for (const output of job.outputs) {
        const card = document.createElement('article'); card.className = 'studio-result';
        const video = document.createElement('video'); video.controls = true; video.preload = 'metadata'; video.playsInline = true; video.src = output.url;
        const title = document.createElement('p'); title.textContent = output.headline || 'Sem título';
        const meta = document.createElement('p'); meta.className = 'studio-help'; meta.textContent = output.label;
        const link = document.createElement('a'); link.href = output.url; link.download = output.fileName; link.textContent = 'Baixar MP4';
        card.append(video, title, meta, link); el('results').append(card);
      }
    }
    el('subtitles').replaceChildren();
    if (job.subtitleUrl) { const link = document.createElement('a'); link.href = job.subtitleUrl; link.download = 'legendas-pt.srt'; link.textContent = 'Baixar legendas em português (.srt)'; el('subtitles').append(link); }
  }
  async function track(id) {
    activeId = id; clearTimeout(pollTimer);
    try { localStorage.setItem('studio-last-job', id); } catch {}
    const tick = async () => {
      try {
        const job = await json(`/api/studio/jobs/${encodeURIComponent(id)}`);
        if (activeId !== id) return;
        showJob(job);
        if (['queued', 'running'].includes(job.status)) pollTimer = setTimeout(tick, 2500);
        else loadHistory();
      } catch (error) {
        if (activeId !== id) return;
        el('job-error').textContent = 'Não foi possível atualizar: ' + error.message + ' O histórico permite abrir a geração novamente.';
      }
    };
    await tick();
  }
  async function loadHistory() {
    try {
      const jobs = await json('/api/studio/jobs');
      el('history-list').replaceChildren();
      if (!jobs.length) el('history-list').textContent = 'Nenhuma geração ainda. Envie um clipe ou descreva sua primeira cena.';
      for (const job of jobs) {
        const row = document.createElement('div'); row.className = 'studio-history-item';
        const label = document.createElement('p'); label.textContent = `${new Date(job.createdAt).toLocaleString('pt-BR')} · ${job.options.mode === 'ai' ? 'Cenas IA' : 'Reaproveitamento'} · ${job.stage}`;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Abrir'; button.setAttribute('aria-label', `Abrir geração de ${new Date(job.createdAt).toLocaleString('pt-BR')}`);
        button.addEventListener('click', async () => { await track(job.id); el('active').scrollIntoView({ block: 'start' }); });
        row.append(label, button); el('history-list').append(row);
      }
    } catch (error) { el('history-list').textContent = error.message; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending) return;
    el('form-error').textContent = '';
    const templates = checked('templates'), formats = checked('formats');
    const headlines = el('headlines').value.split(/\r?\n/).filter(s => s.trim());
    if (!formats.length || !templates.length || templates.length > 3 || headlines.length > 3 || headlines.some(h => [...h.trim()].length > 100)) {
      el('form-error').textContent = 'Escolha ao menos um formato, de 1 a 3 layouts e até 3 títulos de até 100 caracteres.'; return;
    }
    const video = el('video').files[0], reaction = el('reaction').files[0];
    if ((checked('mode')[0] === 'recycle' && video?.size > 250 * 1024 * 1024) || (templates.includes('meme') && reaction?.size > 10 * 1024 * 1024)) {
      el('form-error').textContent = 'O vídeo deve ter até 250 MB e a imagem, até 10 MB.'; return;
    }
    sending = true; updateForm(); el('submit').textContent = 'Enviando…';
    try {
      const data = new FormData(form); data.set('templates', templates.join(',')); data.set('formats', formats.join(','));
      const job = await json('/api/studio/jobs', { method: 'POST', body: data });
      showJob(job); await track(job.id); await loadHistory(); el('active').scrollIntoView({ block: 'start' });
    } catch (error) { el('form-error').textContent = error.message; }
    finally { sending = false; el('submit').textContent = 'Gerar versões'; updateForm(); }
  });
  function routeHash() { if (location.hash.startsWith('#studio')) document.querySelector('[data-tab="studio"]').click(); }
  window.addEventListener('hashchange', routeHash); routeHash();
  json('/api/studio/config').then(data => { config = data; updateForm(); }).catch(error => { el('config').textContent = error.message; el('submit').disabled = true; });
  loadHistory(); updateForm();
  try { const last = localStorage.getItem('studio-last-job'); if (last) track(last); } catch {}
})();
