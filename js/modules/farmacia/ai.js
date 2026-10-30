// Identificação de medicamentos com Gemini através do Firebase AI Logic
// (sem chave no código: usa o projeto Firebase e exige sessão iniciada).
import { app } from '../../services/firebase.js';

const FIREBASE_SDK = '11.10.0';
export const MODELOS = ['gemini-3.6-flash', 'gemini-flash-latest'];

const PROMPT_BASE = `És um farmacêutico em Portugal. Responde SEMPRE em português de Portugal, de forma curta e direta, sem texto desnecessário.
Identifica o medicamento e devolve APENAS um objeto JSON com esta forma exata:
{
  "identificado": true,
  "confianca": "alta" | "media" | "baixa",
  "nome": "nome comercial, ex.: Ben-u-ron",
  "substancia": "substância ativa, ex.: Paracetamol",
  "dosagem": "ex.: 500 mg",
  "forma": "ex.: comprimidos, xarope, pomada",
  "tipo": "classe terapêutica curta, ex.: Analgésico e antipirético, Antibiótico, Anti-inflamatório (AINE), Anti-histamínico",
  "receita": true se for de receita médica obrigatória em Portugal, false se for de venda livre (MNSRM),
  "resumo": "uma frase sobre para que serve",
  "sintomas": ["sintomas/situações em que se toma, 3 a 6 itens curtos"],
  "posologia": [{"idade": "ex.: Adultos e >12 anos", "dose": "ex.: 1 comprimido de 6/6 h, máx. 4 por dia"}],
  "avisos": ["contraindicações e cuidados mais importantes, máx. 5, curtos"],
  "interacoes": ["interações relevantes a evitar, máx. 3"]
}
Regras: a posologia deve cobrir as faixas etárias relevantes (bebés, crianças, adolescentes, adultos, idosos) e dizer "Não recomendado" quando for o caso; usa as doses do folheto informativo aprovado (RCM/Infarmed). Se não conseguires identificar, devolve {"identificado": false, "confianca": "baixa"} e mais nada. Nunca inventes.`;

function extrairJson(texto) {
  const limpo = String(texto || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < 0) throw new Error('Resposta da IA inválida.');
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

function normalizar(d) {
  const lista = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  return {
    identificado: d.identificado !== false && !!d.nome,
    confianca: d.confianca || 'baixa',
    nome: d.nome || '',
    substancia: d.substancia || '',
    dosagem: d.dosagem || '',
    forma: d.forma || '',
    tipo: d.tipo || '',
    receita: d.receita === true,
    resumo: d.resumo || '',
    sintomas: lista(d.sintomas),
    posologia: Array.isArray(d.posologia)
      ? d.posologia.filter((p) => p && p.idade).map((p) => ({ idade: String(p.idade), dose: String(p.dose || '') }))
      : [],
    avisos: lista(d.avisos),
    interacoes: lista(d.interacoes),
  };
}

let modeloFirebase = null;
async function obterModeloFirebase(nomeModelo) {
  if (modeloFirebase?.nome === nomeModelo) return modeloFirebase.modelo;
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import(
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-ai.js`
  );
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const modelo = getGenerativeModel(ai, {
    model: nomeModelo,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  modeloFirebase = { nome: nomeModelo, modelo };
  return modelo;
}

async function pedirFirebase(nomeModelo, partes) {
  const modelo = await obterModeloFirebase(nomeModelo);
  const res = await modelo.generateContent(
    partes.map((p) => (p.texto ? { text: p.texto } : { inlineData: { data: p.base64, mimeType: p.mime } })),
  );
  return res.response.text();
}

async function pedir(partes) {
  let ultimoErro;
  for (const nome of MODELOS) {
    try {
      const texto = await pedirFirebase(nome, partes);
      return normalizar(extrairJson(texto));
    } catch (e) {
      ultimoErro = e;
      // Só vale a pena tentar o modelo seguinte se este não existir/estiver indisponível.
      if (!/not found|404|unsupported|not supported|deprecated/i.test(e?.message || '')) break;
    }
  }
  throw traduzirErro(ultimoErro);
}

function traduzirErro(e) {
  const msg = e?.message || String(e);
  if (/api-not-enabled|firebasevertexai|firebaseml|AI Logic|has not been used|PERMISSION_DENIED/i.test(msg)) {
    return new Error('A IA ainda não está ativa no projeto Firebase. Ativa o "Firebase AI Logic" (Gemini Developer API) na consola Firebase.');
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) return new Error('Limite de pedidos à IA atingido. Tenta de novo daqui a um minuto.');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Sem ligação à internet.');
  return new Error(`Não foi possível analisar o medicamento: ${msg}`);
}

// imagem: { base64, mime } da foto original (melhor para ler o texto da embalagem).
export function analisarFoto(imagem, dica = '') {
  const extra = dica ? `\nO utilizador indica que o medicamento é: "${dica}".` : '';
  return pedir([
    { texto: `${PROMPT_BASE}${extra}\nAnalisa a fotografia da embalagem/blister/frasco.` },
    imagem,
  ]);
}

export function analisarNome(nome) {
  return pedir([{ texto: `${PROMPT_BASE}\nO medicamento é: "${nome}".` }]);
}
