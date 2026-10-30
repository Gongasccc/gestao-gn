// Registo de módulos da app. Para adicionar uma secção nova:
//   1. cria js/modules/<nome>.js (ver README > "Adicionar um módulo")
//   2. importa-o aqui e junta-o ao array
//   3. adiciona a entrada do menu em js/navigation/menu.js

import dashboard from './dashboard.js';
import notifications from './notifications.js';
import library from './library.js';
import friends from './friends.js';
import profile from './profile.js';
import trips from './trips/index.js';
import recipes from './recipes.js';
import documents from './documents.js';
import garage from './garage.js';
import supermarkets from './supermarkets.js';

export const MODULES = [
  dashboard,
  notifications,
  library,
  friends,
  profile,
  trips,
  recipes,
  documents,
  garage,
  supermarkets,
];
