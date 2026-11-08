// Onde vivem os dados de cada menu: no grupo ativo (família, amigos, casal...), no espaço
// pessoal ou numa "partilha" de uma página com outras pessoas (ex.: a Lista de compras com a
// Ana, que não está no grupo). Funções puras, sem Firebase (testadas em tests/espacos.test.mjs).

/** Tipos de grupo. Os grupos antigos (sem tipo) eram casais. */
export const TIPOS_GRUPO = [
  { id: 'familia', label: 'Família', icon: 'home' },
  { id: 'amigos', label: 'Amigos', icon: 'users' },
  { id: 'casal', label: 'Casal', icon: 'heart' },
  { id: 'casa', label: 'Casa partilhada', icon: 'bed' },
  { id: 'outro', label: 'Outro', icon: 'star' },
];
export const tipoGrupo = (g) => TIPOS_GRUPO.find((t) => t.id === (g?.tipo || 'casal')) || TIPOS_GRUPO[0];

/**
 * Páginas que se podem partilhar sozinhas e as coleções (ou documentos de config) de cada uma.
 * 'config/x' quer dizer o documento config/x.
 */
export const PAGINAS_PARTILHAVEIS = [
  { page: 'menu-lista-compras', label: 'Lista de compras', icon: 'clipboard', colecoes: ['semanais', 'rapidas', 'promocoes', 'config/lista_compras'] },
  { page: 'menu-supermercados', label: 'Supermercados', icon: 'cart', colecoes: ['faturas', 'config/produtos', 'config/lojas_nif'] },
  { page: 'menu-receitas', label: 'Livro de Receitas', icon: 'book', colecoes: ['receitas', 'receitas_colecoes', 'livros_receitas', 'receitas_meta'] },
  { page: 'menu-refeicoes', label: 'Plano de refeições', icon: 'restaurant', colecoes: ['refeicoes'] },
  { page: 'menu-tarefas', label: 'Tarefas', icon: 'check', colecoes: ['tarefas'] },
  { page: 'menu-financas', label: 'Finanças', icon: 'wallet', colecoes: ['despesas', 'contas_fixas', 'config/orcamento', 'config/categorias_extrato'] },
  { page: 'menu-carros', label: 'Garagem', icon: 'car', colecoes: ['carros', 'carros_gastos'] },
  { page: 'menu-farmacia', label: 'Farmácia', icon: 'pill', colecoes: ['farmacia', 'tratamentos'] },
];

const PAGINA_DA_CHAVE = new Map(
  PAGINAS_PARTILHAVEIS.flatMap((p) => p.colecoes.map((c) => [c, p.page])),
);

export const paginaPartilhavel = (page) => PAGINAS_PARTILHAVEIS.find((p) => p.page === page) || null;

/** Chave de uma coleção a partir dos segmentos do caminho: ['config', 'orcamento'] -> 'config/orcamento'. */
export function chaveDe(segments) {
  const [a, b] = segments;
  return a === 'config' && b ? `config/${b}` : String(a || '');
}

/** Página a que pertence um caminho (ou null, se não for de uma página partilhável). */
export const paginaDe = (segments) => PAGINA_DA_CHAVE.get(chaveDe(segments)) || null;

/**
 * Ligações ativas: página -> { sid, code }. No grupo ativo ficam no documento do grupo
 * (valem para todos os membros); sem grupo ficam no perfil (só para mim).
 */
export function ligacoesAtivas({ householdId, household, profile }) {
  if (householdId) return household?.ligacoes || {};
  return profile?.ligacoes || {};
}

/**
 * Segmentos do espaço onde vive um caminho:
 *   ['partilhas', sid]        se a página dele está partilhada
 *   ['households', hid]       no grupo ativo
 *   ['users', uid]            no espaço pessoal
 */
export function espacoPara(segments, ctx) {
  const page = paginaDe(segments);
  const lig = page ? ligacoesAtivas(ctx)[page] : null;
  if (lig?.sid) return ['partilhas', lig.sid];
  return ctx.householdId ? ['households', ctx.householdId] : ['users', ctx.uid];
}

/** Lista de grupos do perfil, com a migração do campo antigo (um só casal em householdId). */
export function gruposDoPerfil(profile) {
  const ids = Array.isArray(profile?.householdIds) ? profile.householdIds.filter(Boolean) : [];
  const ativo = profile?.householdId || null;
  if (ativo && !ids.includes(ativo)) ids.unshift(ativo);
  return [...new Set(ids)];
}

/** Estou em modo colaborativo nesta página? Devolve o motivo ou null. */
export function modoColaborativo(page, ctx) {
  const lig = page ? ligacoesAtivas(ctx)[page] : null;
  if (lig?.sid) return { tipo: 'partilha', nome: lig.nome || '' };
  if (ctx.householdId && (ctx.household?.members?.length || 0) > 1) return { tipo: 'grupo', nome: ctx.household?.name || '' };
  return null;
}
