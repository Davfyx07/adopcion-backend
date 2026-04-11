const cloudinary = require('cloudinary').v2;

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
 * Sube una imagen base64 a Cloudinary.
 * @param {string} base64 - Data URI de la imagen
 * @param {string} folder - Carpeta destino en Cloudinary
 * @returns {Promise<string>} URL segura de la imagen subida
 */
const uploadImage = async (base64, folder = 'adopcion') => {
    const result = await cloudinary.uploader.upload(base64, { folder });
    return result.secure_url;
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
