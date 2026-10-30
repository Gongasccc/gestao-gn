// Configuração única da navegação. Para adicionar uma nova secção à app (ex.: Farmácia)
// basta acrescentar uma entrada aqui e registar o módulo em js/modules/index.js.
//
//   page     -> id da página (definida pelo módulo)
//   label    -> texto no menu
//   icon     -> nome do ícone em js/core/icons.js
//   library  -> true para aparecer também na grelha "Biblioteca"
//   children -> submenu opcional
//   badge    -> chave de contador (ver setBadge em sidebar.js)

export const MENU = [
  { page: 'menu-principal', label: 'Início', icon: 'home' },
  { page: 'menu-casal', label: 'O nosso casal', icon: 'heart', library: true },
  { page: 'menu-financas', label: 'Finanças', icon: 'wallet', library: true },
  { page: 'menu-viagens', label: 'Viagens', icon: 'map', library: true },
  { page: 'menu-familia', label: 'Amigos', icon: 'users', library: true },
  { page: 'menu-receitas', label: 'Livro de Receitas', icon: 'book', library: true },
  { page: 'menu-notificacoes', label: 'Notificações', icon: 'bell', badge: 'notifications' },
  {
    page: 'menu-supermercados',
    label: 'Supermercados',
    icon: 'cart',
    library: true,
    children: [
      { page: 'page-gastos', label: 'Gastos e faturas' },
      { page: 'menu-super-logos', label: 'Lojas & Cartões' },
      { page: 'menu-compras-semanais', label: 'Lista Semanal' },
      { page: 'menu-compras-rapidas', label: 'Lista Rápida' },
    ],
  },
  { page: 'menu-refeicoes', label: 'Plano de refeições', icon: 'restaurant', library: true },
  { page: 'menu-carros', label: 'Garagem', icon: 'car', library: true },
  { page: 'menu-farmacia', label: 'Farmácia', icon: 'pill', library: true },
];

export const MENU_FOOTER = [
  { page: 'menu-definicoes', label: 'Definições', icon: 'settings' },
];

export const BOTTOM_NAV = [
  { page: 'menu-principal', label: 'Início', icon: 'home' },
  { page: 'menu-compras-semanais', label: 'Lista', icon: 'cart' },
  { page: 'menu-receitas', label: 'Receitas', icon: 'book' },
  { page: 'menu-refeicoes', label: 'Refeições', icon: 'restaurant' },
  { page: 'menu-biblioteca', label: 'Mais', icon: 'grid', badge: 'notifications' },
];
