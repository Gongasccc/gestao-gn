// Pedidos ao Gemini através do Firebase AI Logic (sem chaves no código: usa o projeto Firebase).
// Usado pela leitura de faturas; qualquer módulo pode pedir uma resposta JSON com texto + imagens/PDF.
import { app } from './firebase.js';

const FIREBASE_SDK = '11.10.0';
export const MODELOS = ['gemini-3.6-flash', 'gemini-flash-latest'];

const modelos = new Map();
async function obterModelo(nome) {
  if (modelos.has(nome)) return modelos.get(nome);
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import(
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-ai.js`
  );
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const modelo = getGenerativeModel(ai, {
    model: nome,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  modelos.set(nome, modelo);
  return modelo;
}

export function extrairJson(texto) {
  const limpo = String(texto || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < 0) throw new Error('Resposta da IA inválida.');
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

function traduzirErro(e) {
  const msg = e?.message || String(e);
  if (/api-not-enabled|firebasevertexai|firebaseml|AI Logic|has not been used|PERMISSION_DENIED/i.test(msg)) {
    return new Error('A IA não está ativa no projeto Firebase (Firebase AI Logic).');
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) return new Error('Limite de pedidos à IA atingido. Tenta de novo daqui a um minuto.');
  if (/Failed to fetch|NetworkError|offline/i.test(msg)) return new Error('Sem ligação à internet.');
  return new Error(msg);
}

/**
 * Envia texto e ficheiros ao Gemini e devolve o JSON da resposta.
 * partes: [{ texto }] ou [{ base64, mime }] (imagem ou application/pdf).
 */
export async function pedirJson(partes) {
  let ultimoErro;
  for (const nome of MODELOS) {
    try {
      const modelo = await obterModelo(nome);
      const res = await modelo.generateContent(
        partes.map((p) => (p.texto ? { text: p.texto } : { inlineData: { data: p.base64, mimeType: p.mime } })),
      );
      return extrairJson(res.response.text());
    } catch (e) {
      ultimoErro = e;
      // Só vale a pena tentar o modelo seguinte se este não existir/estiver indisponível.
      if (!/not found|404|unsupported|not supported|deprecated/i.test(e?.message || '')) break;
    }
  }
  throw traduzirErro(ultimoErro);
}
