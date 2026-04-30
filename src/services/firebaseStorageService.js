const { getStorage } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * Sube una foto base64 a Firebase Storage
 * @param {string} base64Image - Imagen en formato base64 (con o sin data:image/...)
 * @param {string} folder - Carpeta destino (ej: 'mascotas', 'perfiles')
 * @returns {Promise<string>} URL pública de la imagen
 */
async function uploadPhoto(base64Image, folder = 'mascotas') {
  const bucket = getStorage();
  
  // Si Firebase no está configurado, devolver URL mock
  if (!bucket) {
    console.warn('⚠️ Firebase no disponible, usando URL mock');
    return `https://via.placeholder.com/400x400?text=${folder}`;
  }

  try {
    // Limpiar prefijo base64 si existe
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Detectar extensión
    const ext = base64Image.match(/data:image\/(\w+);base64/)?.[1] || 'jpg';
    const filename = `${folder}/${uuidv4()}.${ext}`;
    const file = bucket.file(filename);

    // Subir archivo
    await file.save(buffer, {
      metadata: {
        contentType: `image/${ext}`,
        metadata: {
          firebaseStorageDownloadTokens: uuidv4(),
        },
      },
    });

    // Hacer público
    await file.makePublic();

    // Obtener URL pública
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    console.log(`✅ Foto subida: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error subiendo foto a Firebase:', error.message);
    throw new Error('Error al subir la foto: ' + error.message);
  }
}

/**
 * Sube múltiples fotos base64
 * @param {string[]} base64Images - Array de imágenes en base64
 * @param {string} folder - Carpeta destino
 * @returns {Promise<string[]>} Array de URLs públicas
 */
async function uploadPhotos(base64Images, folder = 'mascotas') {
  if (!Array.isArray(base64Images) || base64Images.length === 0) {
    return [];
  }

  const urls = [];
  for (let i = 0; i < base64Images.length; i++) {
    const url = await uploadPhoto(base64Images[i], folder);
    urls.push(url);
  }
  return urls;
}

/**
 * Elimina una foto de Firebase Storage por URL
 * @param {string} photoUrl - URL de la foto a eliminar
 */
async function deletePhoto(photoUrl) {
  const bucket = getStorage();
  if (!bucket) return;

  try {
    // Extraer path de la URL
    const url = new URL(photoUrl);
    const path = url.pathname.replace(`/${bucket.name}/`, '');
    
    await bucket.file(path).delete();
    console.log(`✅ Foto eliminada: ${path}`);
  } catch (error) {
    console.error('❌ Error eliminando foto:', error.message);
    // No lanzar error - la foto puede no existir
  }
}

/**
 * Elimina múltiples fotos
 * @param {string[]} photoUrls - Array de URLs a eliminar
 */
async function deletePhotos(photoUrls) {
  if (!Array.isArray(photoUrls)) return;
  
  for (const url of photoUrls) {
    await deletePhoto(url);
  }
}

module.exports = {
  uploadPhoto,
  uploadPhotos,
  deletePhoto,
  deletePhotos,
};
