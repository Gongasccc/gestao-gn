// Documentos do casal: organizados em pastas.
import { html } from '../core/dom.js';
import { createScope } from '../core/state.js';
import { sharedCol, sharedDoc } from '../services/paths.js';
import { createFileBrowser } from '../components/file-browser.js';

const scope = createScope();

const browser = createFileBrowser({
  key: 'docs',
  filesCol: () => sharedCol('documentos'),
  foldersCol: () => sharedCol('pastas_docs'),
  fileDoc: (id) => sharedDoc('documentos', id),
  folderDoc: (id) => sharedDoc('pastas_docs', id),
  folderPlaceholder: 'Nome da pasta (ex: Faturas, Casa)',
  emptyText: 'Sem documentos. Carrega o primeiro ficheiro!',
});

export default {
  id: 'documents',
  pages: [{
    id: 'menu-documentos',
    title: 'Documentos',
    root: true,
    template: () => html`${browser.template()}`,
  }],
  modals: () => browser.modals(),
  start() { browser.subscribe(scope); },
  stop() { scope.clear(); },
};
