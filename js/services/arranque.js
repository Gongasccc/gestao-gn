// Ajudas para o arranque nunca ficar preso à espera da rede ou da base de dados local.
// Guardamos no telemóvel uma cópia leve do perfil e do grupo ativo da última entrada com sucesso,
// para a app abrir logo (e no espaço certo) mesmo que o Firestore demore ou esteja bloqueado.

/** Rejeita se a promessa não terminar em `ms` milissegundos. */
export function comPrazo(promessa, ms) {
  let t;
  return Promise.race([
    promessa,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('prazo')), ms); }),
  ]).finally(() => clearTimeout(t));
}

const chave = (uid) => `ninho:sessao:${uid}`;
const MAX_IMAGEM = 20000; // fotos grandes (base64) não vão para o localStorage

const leve = (v) => (typeof v === 'string' && v.length > MAX_IMAGEM ? '' : v);

/** Converte valores do Firestore (Timestamps, etc.) em JSON simples. */
function simples(obj) {
  try { return JSON.parse(JSON.stringify(obj ?? null)); } catch { return null; }
}

export function guardarSessao(uid, { profile, household, members, grupos }) {
  if (!uid) return;
  try {
    const p = simples(profile) || {};
    if (p.avatarUrl) p.avatarUrl = leve(p.avatarUrl);
    const m = (members || []).map((x) => ({ uid: x.uid, name: x.name, avatar: leve(x.avatar) }));
    localStorage.setItem(chave(uid), JSON.stringify({ profile: p, household: simples(household), members: m, grupos: simples(grupos) || [] }));
  } catch { /* sem espaço ou modo privado */ }
}

export function lerSessao(uid) {
  try { return JSON.parse(localStorage.getItem(chave(uid))) || null; } catch { return null; }
}

export function esquecerSessao(uid) {
  try { localStorage.removeItem(chave(uid)); } catch { /* nada */ }
}
