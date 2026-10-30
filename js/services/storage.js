// Upload de ficheiros para o Firebase Storage (substitui base64 dentro do Firestore).
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { app } from './firebase.js';
import { readAsDataURL, MAX_FILE_BYTES } from '../core/images.js';

const storage = getStorage(app);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const safeName = (name) => String(name || 'ficheiro').normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);

/**
 * Envia um ficheiro e devolve { url, path, name, size, type }.
 * scope: 'users/<uid>' | 'households/<hid>' | 'trips/<tripId>'
 */
export async function uploadFile(scope, folder, file) {
  const path = `${scope}/${folder}/${Date.now()}_${safeName(file.name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  return { url: await getDownloadURL(r), path, name: file.name, size: file.size, type: file.type };
}

export async function removeFile(path) {
  if (!path) return;
  await deleteObject(ref(storage, path)).catch((e) => {
    if (e?.code !== 'storage/object-not-found') throw e;
  });
}

/**
 * Guarda um ficheiro no Storage. Se o Storage não estiver ativo no projeto Firebase
 * (ex.: plano gratuito), guarda em base64 dentro do Firestore como antes (máx. ~900 KB).
 */
export async function saveFile(scope, folder, file) {
  try {
    return await uploadFile(scope, folder, file);
  } catch (err) {
    console.warn('[storage] a usar base64 no Firestore', err?.code || err);
    if (file.size > MAX_FILE_BYTES) {
      throw Object.assign(new Error('Ficheiro demasiado grande (máx. ~900 KB enquanto o Firebase Storage não estiver ativo).'), { code: 'too-big' });
    }
    return { url: await readAsDataURL(file), path: '', name: file.name, size: file.size, type: file.type, inline: true };
  }
}

/** Envia uma imagem já comprimida em data URL e devolve { url, path }. Mantém o data URL se o Storage falhar. */
export async function uploadDataUrl(scope, folder, dataUrl, name = 'foto.jpg') {
  if (!dataUrl || !dataUrl.startsWith('data:')) return { url: dataUrl || '', path: '' };
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return await uploadFile(scope, folder, new File([blob], name, { type: blob.type || 'image/jpeg' }));
  } catch (err) {
    console.warn('[storage] a usar base64 no Firestore', err?.code || err);
    return { url: dataUrl, path: '' };
  }
}
