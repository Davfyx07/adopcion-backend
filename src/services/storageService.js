const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { uploadPhoto, deletePhoto } = require('./firebaseStorageService');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET,
});

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Verifica si Firebase Storage está configurado
 */
const isFirebaseConfigured = () => {
    return process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
           process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
           process.env.GOOGLE_APPLICATION_CREDENTIALS;
};

/**
 * Verifica si Cloudinary está configurado
 */
const isCloudinaryConfigured = () => {
    return process.env.CLOUD_NAME && process.env.CLOUD_KEY && process.env.CLOUD_SECRET
        && !process.env.CLOUD_NAME.includes('tu_') && !process.env.CLOUD_KEY.includes('tu_');
};

/**
 * Valida que el string sea una imagen base64 en formato JPG o PNG
 * y que no supere 5MB.
 * @param {string} base64 - Data URI (data:image/jpeg;base64,...)
 * @returns {{ valid: boolean, message?: string }}
 */
const validateBase64Image = (base64) => {
    const validMime = /^data:image\/(jpeg|jpg|png);base64,/;
    if (!validMime.test(base64)) {
        return { valid: false, message: 'La imagen debe ser JPG o PNG en formato base64.' };
    }

    const base64Data = base64.split(',')[1];
    const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
    if (sizeBytes > MAX_SIZE_BYTES) {
        return { valid: false, message: 'La imagen no debe superar los 5MB.' };
    }

    return { valid: true };
};

/**
 * Sube una imagen al storage configurado (Firebase → Cloudinary → Mock).
 * Acepta AMBOS formatos:
 *   - Data URI base64: "data:image/jpeg;base64,/9j/4AAQ..."
 *   - Ruta de archivo local: "/uploads/logos/logo_uuid_123.jpg"
 *
 * @param {string} source - Data URI base64 O ruta de archivo local
 * @param {string} folder - Carpeta destino
 * @returns {Promise<string>} URL segura de la imagen subida
 */
const uploadImage = async (source, folder = 'adopcion') => {
    try {
        // Prioridad 1: Firebase Storage
        if (isFirebaseConfigured()) {
            console.log('[storage] Usando Firebase Storage...');
            return await uploadPhoto(source, folder);
        }

        // Prioridad 2: Cloudinary
        if (isCloudinaryConfigured()) {
            console.log('[storage] Usando Cloudinary...');
            const result = await cloudinary.uploader.upload(source, {
                folder,
                transformation: [{ width: 800, height: 800, crop: 'limit' }],
            });

            // Si el source es un archivo local (multer), borrarlo del disco
            if (!source.startsWith('data:') && fs.existsSync(source)) {
                fs.unlinkSync(source);
            }

            return result.secure_url;
        }

        // Fallback: URL mock para desarrollo local
        console.warn('[storage] Ningún storage configurado. Usando URL mock para desarrollo.');
        return `https://res.cloudinary.com/demo/image/upload/v1/${folder}/mock_${Date.now()}.jpg`;
    } catch (err) {
        console.error('[storage] Error subiendo imagen:', err.message);
        throw new Error('Error al subir la imagen al servidor en la nube.');
    }
};

/**
 * Elimina una imagen del storage configurado.
 * @param {string} url - URL de la imagen
 * @param {string} folder - Carpeta donde está la imagen
 */
const deleteImage = async (url, folder = 'adopcion') => {
    try {
        // Si es URL de Firebase
        if (url.includes('storage.googleapis.com')) {
            await deletePhoto(url);
            return;
        }

        // Si es URL de Cloudinary
        if (url.includes('cloudinary.com')) {
            const publicId = url.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`${folder}/${publicId}`);
            return;
        }

        // Mock URL: no hacer nada
        console.warn('[storage] URL mock detectada, no se elimina nada.');
    } catch (err) {
        console.warn('[storage] No se pudo eliminar imagen anterior:', err.message);
    }
};

module.exports = { uploadImage, deleteImage, validateBase64Image };
