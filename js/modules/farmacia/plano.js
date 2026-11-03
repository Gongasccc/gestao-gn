// Planos de tratamento: cálculo das horas das tomas, duração e progresso. Sem dependências (testável em Node).
//
// Plano (sharedCol('tratamentos')):
//   medId, medNome, unidade, dose (unidades por toma),
//   quem: uid | 'ambos' | 'outro'  (quemNome quando é outra pessoa),
//   modo: 'vezes' | 'intervalo', vezesDia, intervaloHoras, primeiraHora 'HH:MM',
//   horas: ['08:00', '16:00', ...] (calculadas, mas podem ser acertadas à mão),
//   inicio 'AAAA-MM-DD', dias (null = contínuo), notas,
//   feitas: [chave, ...]  (tomas já feitas), avisadas: [chave, ...], terminado (bool).

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deISO = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
const minutos = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hhmm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** Horas das tomas a partir da primeira, espaçadas por igual ao longo das 24 h. Devolve-as por ordem do dia. */
export function calcularHoras({ modo = 'vezes', vezesDia = 1, intervaloHoras = 8, primeiraHora = '08:00' } = {}) {
  const passo = modo === 'intervalo'
    ? Math.max(1, Math.min(24, Number(intervaloHoras) || 8)) * 60
    : Math.round((24 * 60) / Math.max(1, Math.min(24, Math.round(Number(vezesDia) || 1))));
  const n = Math.max(1, Math.floor((24 * 60) / passo));
  const inicio = minutos(primeiraHora);
  return ordenarHoras(Array.from({ length: n }, (_, k) => hhmm((inicio + k * passo) % (24 * 60))));
}

export const ordenarHoras = (horas) => [...new Set(horas.filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => hhmm(minutos(h))))]
  .sort((a, b) => minutos(a) - minutos(b));

/** Pessoas que tomam: 'ambos' passa a uma toma por membro. */
export function pessoasDoPlano(plano, membros = []) {
  if (plano.quem === 'ambos') return membros.length ? membros : ['ambos'];
  return [plano.quem || 'outro'];
}

const chaveDe = (plano, dia, hora, pessoa) => `${plano.id}_${dia.replace(/-/g, '')}_${hora.replace(':', '')}_${pessoa}`;

/** Último dia do plano ('AAAA-MM-DD') ou null quando é contínuo. */
export function fimPlano(plano) {
  if (!plano?.inicio || !Number(plano.dias)) return null;
  const d = deISO(plano.inicio);
  d.setDate(d.getDate() + Number(plano.dias) - 1);
  return iso(d);
}

/** Toma o plano neste dia? */
export function ativoNoDia(plano, dia) {
  if (!plano?.inicio || plano.terminado) return false;
  if (dia < plano.inicio) return false;
  const fim = fimPlano(plano);
  return !fim || dia <= fim;
}

// O primeiro dia só conta a partir da primeira toma (ex.: começa às 20:00 → 20:00 é a primeira).
// Como o plano tem dias × tomas por dia, o que fica de fora no início passa para a manhã a seguir ao fim.
function horasDoDia(plano, dia) {
  const horas = ordenarHoras(plano.horas?.length ? plano.horas : calcularHoras(plano));
  const fim = fimPlano(plano);
  const primeira = minutos(plano.primeiraHora || horas[0]);
  if (dia === plano.inicio) return horas.filter((h) => minutos(h) >= primeira);
  if (fim) {
    const sobra = horas.filter((h) => minutos(h) < primeira).length;
    const diaSeguinte = deISO(fim); diaSeguinte.setDate(diaSeguinte.getDate() + 1);
    if (dia === iso(diaSeguinte)) return horas.filter((h) => minutos(h) < primeira).slice(0, sobra);
  }
  return ativoNoDia(plano, dia) ? horas : [];
}

/** Tomas de um dia: [{ plano, hora, pessoa, chave, feita }] por ordem de hora. */
export function tomasDoDia(planos, dia, membros = []) {
  const out = [];
  for (const plano of planos) {
    if (!plano?.inicio || plano.terminado || dia < plano.inicio) continue;
    for (const hora of horasDoDia(plano, dia)) {
      for (const pessoa of pessoasDoPlano(plano, membros)) {
        const chave = chaveDe(plano, dia, hora, pessoa);
        out.push({ plano, hora, pessoa, chave, dia, feita: (plano.feitas || []).includes(chave) });
      }
    }
  }
  return out.sort((a, b) => minutos(a.hora) - minutos(b.hora) || String(a.plano.medNome).localeCompare(String(b.plano.medNome), 'pt'));
}

/** Tomas por dia e por pessoa (para calcular quanto dura o stock). */
export const tomasPorDia = (plano) => (plano.horas?.length ? ordenarHoras(plano.horas) : calcularHoras(plano)).length;

/** Unidades gastas por dia por todos os planos ativos de um medicamento. */
export function consumoDiario(planos, dia, membros = []) {
  return planos.filter((p) => ativoNoDia(p, dia))
    .reduce((s, p) => s + (Number(p.dose) || 1) * tomasPorDia(p) * pessoasDoPlano(p, membros).length, 0);
}

/** Progresso: { feitas, total (null se contínuo), diaAtual, dias, terminou }. */
export function progresso(plano, hoje, membros = []) {
  const pessoas = pessoasDoPlano(plano, membros).length;
  const dias = Number(plano.dias) || null;
  const total = dias ? dias * tomasPorDia(plano) * pessoas : null;
  const feitas = (plano.feitas || []).length;
  const diaAtual = plano.inicio ? Math.floor((deISO(hoje) - deISO(plano.inicio)) / 86_400_000) + 1 : 0;
  const ultimo = ultimoDiaTomas(plano);
  const terminou = !!plano.terminado || (!!ultimo && hoje > ultimo);
  return { feitas: Math.min(feitas, total ?? feitas), total, diaAtual, dias, terminou };
}

/** Último dia com tomas (pode ser o dia a seguir ao fim, quando a 1.ª toma não foi a primeira hora do dia). */
export function ultimoDiaTomas(plano) {
  const fim = fimPlano(plano);
  if (!fim) return null;
  const horas = ordenarHoras(plano.horas?.length ? plano.horas : calcularHoras(plano));
  const primeira = minutos(plano.primeiraHora || horas[0]);
  if (!horas.some((h) => minutos(h) < primeira)) return fim;
  const d = deISO(fim); d.setDate(d.getDate() + 1);
  return iso(d);
}

/** Data e hora de uma toma (para saber se já passou). */
export function momentoToma(toma) {
  const d = deISO(toma.dia);
  const m = minutos(toma.hora);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

/** 'feita' | 'atrasada' (passou há mais de 30 min) | 'agora' (até 30 min antes/depois) | 'mais-tarde'. */
export function estadoToma(toma, agora = new Date()) {
  if (toma.feita) return 'feita';
  const dif = (agora - momentoToma(toma)) / 60_000;
  if (dif > 30) return 'atrasada';
  if (dif >= -30) return 'agora';
  return 'mais-tarde';
}

/** "3x por dia (08:00 · 16:00 · 00:00)" ou "De 8 em 8 horas (…)". */
export function textoFrequencia(plano) {
  const horas = plano.horas?.length ? ordenarHoras(plano.horas) : calcularHoras(plano);
  const base = plano.modo === 'intervalo'
    ? `De ${Number(plano.intervaloHoras) || 8} em ${Number(plano.intervaloHoras) || 8} horas`
    : horas.length === 1 ? '1x por dia' : `${horas.length}x por dia`;
  return `${base} (${horas.join(' · ')})`;
}

export function textoDuracao(plano) {
  const fim = fimPlano(plano);
  if (!fim) return 'Contínuo, sem data de fim';
  const [, m, d] = fim.split('-');
  const n = Number(plano.dias);
  return `${n} dia${n === 1 ? '' : 's'}, até ${d}/${m}`;
}
