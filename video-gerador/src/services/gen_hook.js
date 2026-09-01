// generateHook.js
// Gera o gancho de abertura + a frase de transição ("...vai começar o Jornal do X")
// lendo direto do trendProfiles.json do projeto (bloco "_ganchos" + cada formato,
// que agora tem "nomeFormato"). Não repete o mesmo gancho de abertura duas vezes
// seguidas pro mesmo formato.
//
// Uso:
//   const { generateHook } = require('./generateHook');
//   const hook = generateHook('jornal_do_cartman');
//   console.log(hook.textoCompleto);
//
// Integração no pipeline de roteiro (pseudo-exemplo):
//   const hook = generateHook(formatoKey);
//   const roteiroFinal = `${hook.textoCompleto}\n\n${corpoDoRoteiro}`;
//   // hook.textoCompleto já pode ir direto pro Fish Audio virar voz

const fs = require('fs');
const path = require('path');

// Ajuste esse caminho se trendProfiles.json estiver em outra pasta do projeto
const TREND_PROFILES_PATH = path.join(__dirname, 'trendProfiles.json');

const profiles = JSON.parse(fs.readFileSync(TREND_PROFILES_PATH, 'utf-8'));
const ganchos = profiles._ganchos;

if (!ganchos) {
  throw new Error(
    'Bloco "_ganchos" não encontrado em trendProfiles.json. Confirme se o arquivo foi atualizado.'
  );
}

// Chaves que não são formatos de vídeo (são metadados)
const CHAVES_IGNORADAS = new Set(['_arquetiposDePersonagem', '_ganchos']);

// Guarda em memória o último gancho de abertura usado por formato,
// pra nunca repetir a mesma frase duas vezes seguidas no mesmo personagem.
const ultimoUsado = {};

function sortear(lista, evitar) {
  if (lista.length === 1) return lista[0];
  let escolha;
  do {
    escolha = lista[Math.floor(Math.random() * lista.length)];
  } while (escolha === evitar);
  return escolha;
}

/**
 * Gera um gancho completo (abertura + transição) para um formato específico
 * (ex: "peter_conspira", "jornal_do_cartman", "jornal_do_rick").
 * @param {string} formatoKey
 * @returns {{ abertura: string, meio: string, textoCompleto: string, personagem: string, nomeFormato: string }}
 */
function generateHook(formatoKey) {
  const formato = profiles[formatoKey];
  if (!formato || CHAVES_IGNORADAS.has(formatoKey)) {
    throw new Error(`Formato "${formatoKey}" não existe em trendProfiles.json`);
  }
  if (!formato.nomeFormato) {
    throw new Error(
      `Formato "${formatoKey}" não tem campo "nomeFormato" definido em trendProfiles.json`
    );
  }

  const abertura = sortear(ganchos.ganchosAbertura, ultimoUsado[formatoKey]);
  ultimoUsado[formatoKey] = abertura;

  const condicional = sortear(ganchos.condicionais);
  const verboTemplate = sortear(ganchos.formatosVerbo);
  const palavrao = sortear(ganchos.palavroes);
  const verbo = verboTemplate.replace('{palavrao}', palavrao);

  const meio = `${condicional}, já se prepara que ${verbo} ${formato.nomeFormato}`;
  const textoCompleto = `${abertura}!\n\n${meio}.`;

  return {
    abertura,
    meio,
    textoCompleto,
    personagem: formato.personagem,
    nomeFormato: formato.nomeFormato,
  };
}

/** Lista todos os formatos disponíveis no trendProfiles.json */
function listarFormatos() {
  return Object.keys(profiles).filter((k) => !CHAVES_IGNORADAS.has(k));
}

/** Gera N exemplos de uma vez, útil pra revisar variação antes de usar em produção. */
function gerarExemplos(formatoKey, n = 5) {
  return Array.from({ length: n }, () => generateHook(formatoKey));
}

module.exports = { generateHook, gerarExemplos, listarFormatos };

// Se rodar direto (node generateHook.js), mostra exemplos de cada formato do arquivo real
if (require.main === module) {
  for (const formatoKey of listarFormatos()) {
    console.log(`\n=== ${formatoKey} ===`);
    gerarExemplos(formatoKey, 3).forEach((h, i) => {
      console.log(`\n[${i + 1}] ${h.textoCompleto}`);
    });
  }
}