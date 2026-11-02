// Identificação de medicamentos com o Gemini (Firebase AI Logic, através de services/gemini.js).
import { pedirJson } from '../../services/gemini.js';

const PROMPT_BASE = `És um farmacêutico em Portugal. Responde SEMPRE em português de Portugal, de forma curta e direta, sem texto desnecessário.
Identifica o medicamento e devolve APENAS um objeto JSON com esta forma exata:
{
  "identificado": true,
  "confianca": "alta" | "media" | "baixa",
  "nome": "nome comercial, ex.: Ben-u-ron",
  "substancia": "substância ativa, ex.: Paracetamol",
  "dosagem": "ex.: 500 mg",
  "forma": "ex.: comprimidos, cápsulas, xarope, pomada",
  "unidadesEmbalagem": número de unidades na embalagem tal como está escrito na caixa (ex.: "20 comprimidos" -> 20; "blister de 10 x 2" -> 20; xarope de 200 ml -> 200), ou null se não aparecer,
  "unidade": "palavra no plural para as unidades, ex.: comprimidos, cápsulas, saquetas, ml, doses",
  "validade": "AAAA-MM ou AAAA-MM-DD se a data de validade (VAL/EXP) estiver visível, senão vazio",
  "tipo": "classe terapêutica curta, ex.: Analgésico e antipirético, Antibiótico, Anti-inflamatório (AINE), Anti-histamínico",
  "receita": true se for de receita médica obrigatória em Portugal, false se for de venda livre (MNSRM),
  "resumo": "uma frase sobre para que serve",
  "sintomas": ["sintomas/situações em que se toma, 3 a 6 itens curtos"],
  "posologia": [{"idade": "ex.: Adultos e >12 anos", "dose": "ex.: 1 comprimido de 6/6 h, máx. 4 por dia"}],
  "avisos": ["contraindicações e cuidados mais importantes, máx. 5, curtos"],
  "interacoes": ["interações relevantes a evitar, máx. 3"]
}
Regras: a posologia deve cobrir as faixas etárias relevantes (bebés, crianças, adolescentes, adultos, idosos) e dizer "Não recomendado" quando for o caso; usa as doses do folheto informativo aprovado (RCM/Infarmed). Se o texto da caixa estiver em parte ilegível, usa o que conseguires ler (nome, dosagem) e baixa a confiança. Só devolve {"identificado": false, "confianca": "baixa"} se não conseguires ler nem o nome. Nunca inventes.`;

const numero = (v) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const VALIDADE = /^\d{4}-\d{2}(-\d{2})?$/;

export function normalizar(d = {}) {
  const lista = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  return {
    identificado: d.identificado !== false && !!d.nome,
    confianca: d.confianca || 'baixa',
    nome: d.nome || '',
    substancia: d.substancia || '',
    dosagem: d.dosagem || '',
    forma: d.forma || '',
    unidadesEmbalagem: numero(d.unidadesEmbalagem),
    unidade: d.unidade || (/comprimid/i.test(d.forma || '') ? 'comprimidos' : 'unidades'),
    validade: VALIDADE.test(d.validade || '') ? d.validade : '',
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

async function pedir(partes) {
  try {
    return normalizar(await pedirJson(partes));
  } catch (e) {
    throw new Error(`Não foi possível analisar o medicamento: ${e.message}`);
  }
}

// imagem: { base64, mime } da foto original (melhor para ler o texto da embalagem).
export function analisarFoto(imagem, dica = '') {
  const extra = dica ? `\nO utilizador indica que o medicamento é: "${dica}".` : '';
  return pedir([
    { texto: `${PROMPT_BASE}${extra}\nAnalisa a fotografia da embalagem/blister/frasco. Lê com atenção a quantidade (ex.: "20 comprimidos") e a validade impressas na caixa.` },
    imagem,
  ]);
}

export function analisarNome(nome) {
  return pedir([{ texto: `${PROMPT_BASE}\nO medicamento é: "${nome}". Se não souberes quantas unidades tem a embalagem, devolve "unidadesEmbalagem": null.` }]);
}
