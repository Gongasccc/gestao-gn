// Configuração única da navegação. Para adicionar uma nova secção à app (ex.: Farmácia)
// basta acrescentar uma entrada aqui e registar o módulo em js/modules/index.js.
//
//   page     -> id da página (definida pelo módulo)
//   label    -> texto no menu
//   icon     -> nome do ícone em js/core/icons.js
//   library  -> true para aparecer também na grelha "Biblioteca"
//   children -> submenu opcional
//   badge    -> chave de contador (ver setBadge em sidebar.js)
//   group    -> grupo do menu lateral (MENU_GROUPS)
//   sidebar  -> false para não aparecer no menu lateral (só na Biblioteca/barra inferior)

// Grupos do menu lateral (por esta ordem). Cada entrada do MENU diz a que grupo pertence.
export const MENU_GROUPS = [
  { id: 'principal', label: 'Principal' },
  { id: 'casa', label: 'Casa & Alimentação' },
  { id: 'gestao', label: 'Gestão diária' },
  { id: 'conta', label: 'Conta' },
];

export const MENU = [
  { group: 'principal', page: 'menu-principal', label: 'Início', icon: 'home' },
  // Gastos e faturas, Lojas & Cartões e as listas abrem a partir da página Supermercados.
  { group: 'casa', page: 'menu-supermercados', label: 'Supermercados', icon: 'cart', library: true },
  { group: 'casa', page: 'menu-refeicoes', label: 'Plano de refeições', icon: 'restaurant', library: true },
  { group: 'casa', page: 'menu-receitas', label: 'Livro de Receitas', icon: 'book', library: true },
  { group: 'gestao', page: 'menu-tarefas', label: 'Tarefas', icon: 'check', library: true, sidebar: false },
  { group: 'gestao', page: 'menu-financas', label: 'Finanças', icon: 'wallet', library: true },
  { group: 'gestao', page: 'menu-carros', label: 'Garagem', icon: 'car', library: true },
  { group: 'gestao', page: 'menu-farmacia', label: 'Farmácia', icon: 'pill', library: true },
  { group: 'gestao', page: 'menu-viagens', label: 'Viagens', icon: 'map', library: true },
  { group: 'conta', page: 'menu-notificacoes', label: 'Notificações', icon: 'bell', badge: 'notifications', library: true },
  { group: 'conta', page: 'menu-definicoes', label: 'Definições', icon: 'settings', library: true },
];

// Barra inferior no telemóvel (4 itens). "Menu" abre a lista de todas as secções.
export const BOTTOM_NAV = [
  { page: 'menu-principal', label: 'Início', icon: 'home' },
  { page: 'menu-tarefas', label: 'Tarefas', icon: 'check' },
  { page: 'menu-refeicoes', label: 'Refeições', icon: 'restaurant' },
  { page: 'menu-biblioteca', label: 'Menu', icon: 'menu', badge: 'notifications' },
];
