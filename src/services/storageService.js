const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET,
});

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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
 * Sube una imagen a Cloudinary.
 * Acepta AMBOS formatos:
 *   - Data URI base64 (adoptante): "data:image/jpeg;base64,/9j/4AAQ..."
 *   - Ruta de archivo local (albergue vía multer): "/uploads/logos/logo_uuid_123.jpg"
 * Cloudinary detecta automáticamente el formato.
 *
 * @param {string} source - Data URI base64 O ruta de archivo local
 * @param {string} folder - Carpeta destino en Cloudinary
 * @returns {Promise<string>} URL segura de la imagen subida
 */
const uploadImage = async (source, folder = 'adopcion') => {
    try {
        // Bypass para desarrollo local sin Cloudinary configurado
        const cloudConfigured = process.env.CLOUD_NAME && process.env.CLOUD_KEY && process.env.CLOUD_SECRET
            && !process.env.CLOUD_NAME.includes('tu_') && !process.env.CLOUD_KEY.includes('tu_');
        if (!cloudConfigured) {
            console.warn('[storage] Cloudinary no configurado. Usando URL mock para desarrollo.');
            return `https://res.cloudinary.com/demo/image/upload/v1/${folder}/mock_${Date.now()}.jpg`;
        }

        const result = await cloudinary.uploader.upload(source, {
            folder,
            transformation: [{ width: 800, height: 800, crop: 'limit' }],
        });

        // Si el source es un archivo local (multer), borrarlo del disco
        if (!source.startsWith('data:') && fs.existsSync(source)) {
            fs.unlinkSync(source);
        }

        return result.secure_url;
    } catch (err) {
        console.error('[storage] Error subiendo imagen a Cloudinary:', err.message);
        throw new Error('Error al subir la imagen al servidor en la nube.');
    }
};

/**
 * Elimina una imagen de Cloudinary por su URL.
 * @param {string} url - URL de la imagen en Cloudinary
 * @param {string} folder - Carpeta donde está la imagen
 */
const deleteImage = async (url, folder = 'adopcion') => {
    try {
        const publicId = url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`${folder}/${publicId}`);
    } catch (err) {
        console.warn('[storage] No se pudo eliminar imagen anterior:', err.message);
    }
};

module.exports = { uploadImage, deleteImage, validateBase64Image };
