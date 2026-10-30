import { addDoc } from './firebase.js';
import { otherUserCol } from './paths.js';
import { pad2 } from '../core/format.js';

/** Cria uma notificação na caixa de outro utilizador. */
export async function notifyUser(targetUid, texto) {
  if (!targetUid) return;
  const now = new Date();
  await addDoc(otherUserCol(targetUid, 'notifications'), {
    texto,
    dataStr: `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`,
    horaStr: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    lida: false,
    timestamp: Date.now(),
  });
}
