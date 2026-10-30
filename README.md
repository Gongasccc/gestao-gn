# Gestão G&N

A app de organização do casal: um espaço partilhado pelos dois com tarefas, finanças, calendário, datas importantes, metas, plano de refeições, casa, desejos, memórias, viagens, receitas, documentos, garagem e listas de compras.

Site estático (GitHub Pages) com Firebase (Auth + Firestore). Não há passo de build: o browser carrega os ES modules diretamente.

## Correr localmente

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

## Testes

```bash
npm test        # testes das contas (datas, saldos) com o test runner do Node
npm run check   # verifica a sintaxe de todos os módulos
```

## O casal (dados partilhados)

Cada conta pode pertencer a um **casal** (`artifacts/gestao-gn-app/households/{id}`, com `members: [uid, uid]`).
Um cria o casal em "O nosso casal" e recebe um código de 6 caracteres; o outro escreve o código e entra.
Ao entrar, os dados pessoais antigos (tarefas, listas, receitas, documentos, garagem) são copiados uma vez para o casal.

Nos módulos usa sempre `sharedCol(...)` / `sharedDoc(...)` (em `services/paths.js`): apontam para o casal se existir, ou para o espaço pessoal se ainda não houver casal.
Para registos simples (lista + formulário), usa `components/record-list.js`, que já trata do modal de criar/editar/apagar e do upload de fotos.

## Firebase: passos na consola

1. **Regras**: publica `firestore.rules` e `storage.rules` (Firestore > Regras e Storage > Regras), ou `firebase deploy --only firestore:rules,storage`.
2. **Storage** (ficheiros grandes, fotos): ativa o Firebase Storage. Em projetos novos exige o plano Blaze; sem ele, a app continua a guardar ficheiros até ~900 KB dentro do Firestore.
3. **Recuperar password**: em Authentication > Templates, confirma o email de "redefinição de password". Cada pessoa associa o seu email em Definições > Email de recuperação.

## Estrutura

```
index.html                 casca da app (overlay de login, topbar, menu, barra inferior)
manifest.webmanifest       instalação como app (PWA)
assets/brand/              logótipos
css/
  tokens.css               variáveis: cores, vidro, raios, movimento (tema claro/escuro)
  base.css                 reset + fundo ambiente animado
  glass.css                sistema "liquid glass" (.glass, .glass-soft, .glass-chip…)
  layout.css               topbar, menu lateral, páginas, barra inferior, desktop
  components.css           botões, campos, listas, cartões, modais, toasts…
  animations.css           keyframes e transições (respeita prefers-reduced-motion)
  modules/*.css            estilos específicos de cada secção
js/
  main.js                  ponto de entrada: monta módulos, navegação e autenticação
  app/auth.js              login, registo e ciclo de vida da sessão
  core/
    dom.js                 html`` com escape automático (anti-XSS), render, countUp
    events.js              delegação de eventos via data-action / data-change / data-input / data-enter
    router.js              navegação por stack, integrada com o botão "voltar" do sistema
    ui.js                  modais, diálogos, toasts, visualizador de imagens
    state.js               sessão, event bus (on/emit) e scopes de subscrições
    theme.js               tema e cor de destaque
    glass.js               reflexo que segue o dedo, refração (Chromium), ripple
    images.js              compressão de imagens antes de guardar
    format.js, icons.js
  services/
    firebase.js            inicialização única do Firebase
    paths.js               todos os caminhos do Firestore
    notifications.js       enviar notificações a outro utilizador
    household.js           casal: criar, convidar, entrar, sair e migrar dados antigos
    storage.js             upload para o Firebase Storage (com alternativa base64)
  navigation/
    menu.js                configuração do menu lateral, Biblioteca e barra inferior
    sidebar.js             renderização do menu e gestos
  components/              checklist, explorador de ficheiros, foto, tabs, avatar, record-list
  modules/                 uma pasta/ficheiro por secção da app
```

## Adicionar um módulo (ex.: Farmácia)

1. Cria `js/modules/farmacia.js`:

```js
import { html } from '../core/dom.js';
import { createScope } from '../core/state.js';

const scope = createScope();

export default {
  id: 'farmacia',
  pages: [{
    id: 'menu-farmacia',
    title: 'Farmácia',
    root: true, // página de topo (mostra avatar em vez de "voltar")
    template: () => html`<button class="btn btn--primary" data-action="farmacia:foto">Fotografar</button>`,
    onEnter: () => {},
  }],
  modals: () => html``,
  actions: {
    'farmacia:foto': ({ el, ev, data, value }) => { /* … */ },
  },
  start() { /* subscrições Firestore: scope.add(onSnapshot(...)) */ },
  stop() { scope.clear(); },
};
```

2. Importa-o em `js/modules/index.js` e junta-o ao array `MODULES`.
3. Acrescenta `{ page: 'menu-farmacia', label: 'Farmácia', icon: 'pill', library: true }` em `js/navigation/menu.js`.
4. (Opcional) Estilos em `css/modules/farmacia.css`, ligado no `index.html`.

## Boas práticas usadas

- Todo o texto vindo da base de dados passa por `html```, que escapa HTML automaticamente.
- Nada é exposto em `window`; os cliques usam `data-action="modulo:acao"`.
- Cada módulo limpa as suas subscrições do Firestore no logout (`createScope`).
- Imagens são comprimidas antes de ir para o Firestore (limite de 1 MB por documento).
- Os dados antigos continuam a funcionar: sem casal, a app lê do espaço pessoal como antes.
- Ficheiros vão para o Firebase Storage; o Firestore guarda só o link.
- `sw.js` guarda a app para abrir offline e o Firestore tem cache local persistente.
