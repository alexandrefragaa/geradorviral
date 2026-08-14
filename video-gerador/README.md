# Motor de Geração de Vídeo (Parte 1)

Motor automático que junta: personagem recortado + fundo (parkour/Minecraft) +
voz + legenda estilizada sincronizada + música, e gera roteiro no estilo de
canais de referência (ex: Peter Conspira, Jornal do Cartman, Jornal do Rick).

## 1. Instalar

```bash
npm install
pip install rembg onnxruntime --break-system-packages   # recorte de personagem
```

Copie `.env.example` pra `.env` e preencha:

- `ELEVENLABS_API_KEY` — geração de voz
- `OPENAI_API_KEY` — transcrição com timestamp (legenda sincronizada)
- `ANTHROPIC_API_KEY` — geração de roteiro no estilo de cada canal

## 2. Preparar os assets

- Coloque vídeos de fundo (parkour, Minecraft, Subway Surfers etc.) em `backgrounds/`
- Coloque trilhas em `music/` (opcional)
- Personagem: você sobe a imagem na hora de gerar (não precisa recortar antes,
  o motor faz isso sozinho)

## 3. Rodar

```bash
npm start
```

## 4. Endpoints

### `GET /styles`
Lista os perfis de canal disponíveis pra gerar roteiro (`peter_conspira`,
`jornal_do_cartman`, `jornal_do_rick`). Cada perfil descreve o **formato**
do canal (personagem, tom, temas, tipo de gancho, CTA) — não copia roteiros
reais, gera conteúdo novo nesse estilo. Dá pra adicionar novos perfis em
`data/trendProfiles.json`.

### `POST /generate-script`
```json
{ "channelKey": "peter_conspira", "topic": "algoritmo do TikTok" }
```
Devolve só o roteiro gerado, pra revisar antes de virar vídeo.

### `POST /generate` (multipart/form-data)
Campos:
- `character` (arquivo de imagem) — obrigatório
- `voiceId` (ID da voz no ElevenLabs) — obrigatório
- `background` (nome do arquivo em `backgrounds/`) — obrigatório
- `music` (nome do arquivo em `music/`) — opcional
- **ou** `script` (texto pronto) **ou** `channelKey` + `topic` (gera o roteiro
  automaticamente no estilo do canal antes de renderizar)
- `style` (JSON opcional: `{"fontSize":72,"fontColor":"&H00FFFFFF"}`) — customiza a legenda

Resposta:
```json
{ "jobId": "...", "status": "concluído", "videoUrl": "/output/.../final.mp4", "script": "..." }
```

## O que já funciona (testado)

- ✅ Recorte de personagem (rembg) — testado e validado
- ✅ Legenda estilizada palavra-por-palavra sincronizada (.ass)
- ✅ Composição final em ffmpeg (fundo + personagem + legenda + áudio)
- ⚠️ Voz (ElevenLabs), transcrição (Whisper) e roteiro (Claude) exigem suas
  próprias chaves de API — o código está pronto, só falta você plugar as chaves

## Limitação importante

Este motor **não** coleta vídeos automaticamente do TikTok (não dá pra
automatizar isso sem violar os termos da plataforma, e copiar roteiros de
outros criadores é problema de direitos autorais). Em vez disso, os
`trendProfiles.json` capturam o **formato/gênero** de cada canal de
referência, e o gerador de roteiro cria conteúdo original nesse estilo.

## Efeitos dinâmicos (novo)

O `/generate` aceita:
- `backgrounds` — um ou mais nomes de arquivo separados por vírgula (ex:
  `"parkour1.mp4,minecraft2.mp4"`). Com mais de um, o motor corta e faz
  transição (crossfade) entre eles automaticamente.
- `effects` (JSON opcional): `{"zoom": true, "transitionDuration": 0.6, "characterPop": true}`
  - `zoom`: zoom de câmera lento e contínuo no fundo (efeito Ken Burns)
  - `transitionDuration`: duração da transição entre cenas de fundo (segundos)
  - `characterPop`: o personagem "aparece" com um pequeno zoom de entrada + flutuação contínua

## Roteiro no padrão MFV

O gerador de roteiro segue a estrutura de batidas do método (gancho 0-5s →
loop de retenção 5-45s com bordão/contexto/opinião/picos de emoção → CTA
duplo 45-60s), com base nos arquétipos de personagem magnético
(idiota caótico, psicótico sem filtro, idiota genial, gênio louco). Ver
`data/trendProfiles.json`.

## Tela web

Rode `npm start` e abra `http://localhost:3000` no navegador — tem formulário
pra subir o personagem, escolher estilo/tema, revisar o roteiro gerado e
renderizar o vídeo com preview direto na página, mais uma aba de Trends.

## Aba de Trends (vídeos em alta com personagens)

- **YouTube**: real, via API oficial (`YOUTUBE_API_KEY` no `.env`, gere em
  console.cloud.google.com). Busca por termos de personagem (Peter Griffin,
  Cartman, Rick Sanchez etc. + "notícia"/"conspiração"/"viral"), filtra os
  últimos 30 dias e ordena por visualizações. Atualiza sozinho a cada 5
  minutos (`src/services/trendsCache.js`) e fica em cache — a tela web só
  busca o cache, não bate na API do YouTube a cada request.
- **TikTok**: não incluído. Não existe API pública de tendências pra
  desenvolvedores comuns (só uma API de pesquisa acadêmica com aprovação
  restrita) — automatizar coleta de lá seria scraping fora dos termos da
  plataforma. Se no futuro você contratar uma API paga de terceiros (Exolyt,
  Kalodata etc.), dá pra criar um `tiktokTrends.js` no mesmo padrão de
  `youtubeTrends.js` e plugar no `trendsCache.js`.

Pra ajustar os termos de busca, edite o array `QUERIES` em
`src/services/youtubeTrends.js`.


## Vozes de personagem (Fish Audio)

Troquei de ElevenLabs pra Fish Audio. Em `data/voices.json` estão as chaves de
personagem prontas (`peter_griffin`, `stewie`, `bob_esponja`, `rick_sanchez`,
`gumball`, `darwin`, `pernalonga`, `gaguinho`) — mas cada uma precisa do
`referenceId` (ID da voz no Fish Audio) preenchido por você:

1. Entre em fish.audio, procure na biblioteca de vozes por uma já parecida
   com o personagem, **ou** suba um áudio de referência e crie seu próprio
   clone de voz
2. Copie o ID da voz e cole no campo `referenceId` do personagem em
   `data/voices.json`

Sem isso preenchido, o `/generate` devolve erro claro dizendo qual voz falta
configurar.

## Retenção (hook + ritmo até o final)

O gerador de roteiro é obrigado a: parar o scroll nos primeiros 3 segundos,
nunca ficar "morno" por mais de 3s seguidos, e só resolver a curiosidade no
fechamento — pra pessoa assistir até o final. Isso já estava no padrão MFV e
foi reforçado no prompt (`src/services/scriptGenerator.js`).

## 15 personagens magnéticos

Organizados em 5 categorias (`data/trendProfiles.json` > `_arquetiposDePersonagem`):

- **Caóticos**: Peter Griffin, Homer Simpson, Stan Smith
- **Explosivos**: Cartman, Stewie Griffin, Angelica Pickles
- **Calmos**: Pernalonga, Rick Sanchez, Kronk
- **Engraçados**: Bob Esponja, Patrick Estrela, Gaguinho
- **Marcantes**: Gumball, Darwin, Dexter

## Geração de imagem do personagem (Seedream via fal.ai)

Em vez de subir uma foto, você escolhe o personagem e (opcionalmente) uma
roupa específica — o motor gera a imagem já com a roupa/cena batendo com o
tema do roteiro, usando Seedream (`FAL_API_KEY` no `.env`, gere em fal.ai).
Se preferir usar sua própria imagem, a tela web tem um checkbox "usar upload
manual".

**Nota de direitos autorais**: os personagens usados aqui (Peter Griffin,
Bob Esponja etc.) são propriedade de seus estúdios. Gerar imagens/vídeos com
eles pra paródia/comentário é uma prática comum nesse nicho (é literalmente
como os canais de referência que você mandou funcionam), mas o risco de
strike/remoção por direitos autorais é seu, não tem como eliminar isso.

## Publicação automática (TikTok, YouTube Shorts, Instagram)

Cada plataforma exige que VOCÊ registre um app de desenvolvedor e autorize
sua própria conta — não tem como pular essa parte:

- **YouTube**: crie um projeto em console.cloud.google.com, ative a
  "YouTube Data API v3", crie credenciais OAuth (tipo "Desktop app"), gere
  um refresh token com escopo `youtube.upload` (rode o fluxo OAuth uma vez).
  Preencha `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.
- **TikTok**: crie um app em developers.tiktok.com, adicione o produto
  "Content Posting API" e peça a revisão pra postar público direto — leva
  de 2 a 4 semanas. Sem aprovação, os posts saem como privados. Preencha
  `TIKTOK_ACCESS_TOKEN`.
- **Instagram**: precisa de conta profissional (Business/Creator) vinculada
  a uma Página do Facebook, app em developers.facebook.com com o produto
  Instagram Graph API. Preencha `INSTAGRAM_ACCESS_TOKEN` e `INSTAGRAM_USER_ID`.

**Importante**: TikTok e Instagram puxam o vídeo de uma URL pública — não
funciona com `localhost`. Você precisa hospedar este servidor em algum lugar
acessível pela internet (ex: Render, como você já faz com o Iana) e
preencher `PUBLIC_BASE_URL` com essa URL. O YouTube não tem essa exigência
(o upload é direto, arquivo por arquivo).

Na tela web, depois que o vídeo renderiza aparece uma caixa "Publicar em"
com checkbox por plataforma.
