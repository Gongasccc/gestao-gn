// Receita a partir do texto de uma página (quando o site não publica dados estruturados
// ou só mostra a receita depois de carregar com JavaScript). Usa o Gemini (services/gemini.js).
import { pedirJson } from '../../services/gemini.js';
import { sourceName } from './parse.js';

const PROMPT = `Extrai a receita deste conteúdo de uma página web (pode ter menus, publicidade e texto irrelevante: ignora-os).
Responde em português de Portugal e devolve APENAS um objeto JSON com esta forma:
{
  "encontrada": true,
  "titulo": "nome da receita",
  "porcoes": "ex.: 4",
  "tempoPrep": "ex.: 15 min",
  "tempoCozedura": "ex.: 40 min",
  "ingredientes": ["um ingrediente por linha, com quantidade, tal como na página"],
  "passos": ["um passo por linha"],
  "notas": "descrição curta, se houver",
  "foto": "URL absoluto da imagem principal da receita, se aparecer"
}
Se não houver nenhuma receita no conteúdo, devolve {"encontrada": false}. Nunca inventes ingredientes nem passos.`;

const lista = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((s) => String(s).trim()).filter(Boolean);

export async function receitaComIA(texto, url) {
  const d = await pedirJson([{ texto: `${PROMPT}\n\nURL: ${url}\n\nCONTEÚDO:\n${String(texto).slice(0, 60000)}` }]);
  const ingredientes = lista(d.ingredientes);
  if (d.encontrada === false || !d.titulo || !ingredientes.length) return null;
  return {
    titulo: String(d.titulo).trim(),
    fonte: url,
    fonteNome: sourceName(url),
    foto: /^https?:\/\//.test(d.foto || '') ? d.foto : '',
    tempoPrep: d.tempoPrep || '',
    tempoCozedura: d.tempoCozedura || '',
    porcoes: d.porcoes ? String(d.porcoes) : '',
    ingredientes: ingredientes.join('\n'),
    passos: lista(d.passos).join('\n'),
    notas: d.notas || '',
    nutricao: '',
  };
}
