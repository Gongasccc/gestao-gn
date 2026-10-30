// Validades, contagem decrescente e links oficiais.
const DIA = 86_400_000;
export const DIAS_ALERTA = 30;

// Validade guardada como 'AAAA-MM-DD' (ou 'AAAA-MM' quando a embalagem só tem mês/ano).
// O medicamento vale até ao fim desse dia (ou do último dia do mês).
export function fimValidade(validade) {
  if (!validade) return null;
  const [a, m, d] = validade.split('-').map(Number);
  if (!a || !m) return null;
  return d ? new Date(a, m - 1, d, 23, 59, 59) : new Date(a, m, 0, 23, 59, 59);
}

export function estadoValidade(validade, agora = Date.now()) {
  const fim = fimValidade(validade);
  if (!fim) return { estado: 'sem', ms: Infinity };
  const ms = fim.getTime() - agora;
  if (ms <= 0) return { estado: 'expirado', ms };
  if (ms <= DIAS_ALERTA * DIA) return { estado: 'alerta', ms };
  return { estado: 'ok', ms };
}

const dois = (n) => String(n).padStart(2, '0');

export function textoContagem(validade, agora = Date.now()) {
  const { estado, ms } = estadoValidade(validade, agora);
  if (estado === 'sem') return 'Sem validade';
  if (estado === 'expirado') {
    const dias = Math.floor(-ms / DIA);
    return dias === 0 ? 'Expirou hoje' : `Expirado há ${dias} dia${dias === 1 ? '' : 's'}`;
  }
  if (estado === 'ok') return `Válido até ${formatarData(validade)}`;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  return `${d}d ${dois(Math.floor((s % 86400) / 3600))}h ${dois(Math.floor((s % 3600) / 60))}m ${dois(s % 60)}s`;
}

export function formatarData(validade) {
  const [a, m, d] = (validade || '').split('-');
  if (!a) return '';
  return d ? `${d}/${m}/${a}` : `${m}/${a}`;
}

// Infarmed (INFOMED) é a fonte oficial em Portugal para o Folheto Informativo e o RCM.
export function linksOficiais(med) {
  const nome = [med.nome, med.dosagem].filter(Boolean).join(' ');
  const substancia = med.substancia || med.nome || '';
  const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return [
    {
      titulo: 'Folheto informativo (PDF)',
      fonte: 'Infarmed',
      url: google(`${nome} folheto informativo site:infarmed.pt filetype:pdf`),
    },
    {
      titulo: 'INFOMED: RCM e folheto',
      fonte: 'Infarmed',
      url: 'https://extranet.infarmed.pt/INFOMED-fo/',
    },
    {
      titulo: 'Agência Europeia do Medicamento',
      fonte: 'EMA',
      url: `https://www.ema.europa.eu/en/search?search_api_fulltext=${encodeURIComponent(substancia)}`,
    },
  ];
}
