const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

/**
 * Servicio de Upload — Patrón Adaptador
 * 
 * Configurado para usar Cloudinary.
 */

const uploadLogo = async (file) => {
    // Configuramos cloudinary con las variables de entorno
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
        // Subimos el archivo a Cloudinary
        const result = await cloudinary.uploader.upload(file.path, {
            folder: 'adopcion/logos',
            transformation: [{ width: 500, height: 500, crop: 'limit' }],
        });

        // Borramos el archivo local de /uploads/logos/ para no llenar el disco
        fs.unlinkSync(file.path);

        // Retornamos la URL segura de Cloudinary
        return result.secure_url;
    } catch (error) {
        console.error('Error subiendo a Cloudinary:', error);
        throw new Error('Error al subir la imagen al servidor en la nube.');
    }
};

module.exports = { uploadLogo };
