const { validateBase64Image } = require('../services/storageService');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateCreateMascota = (req, res, next) => {
    const { nombre, descripcion, fotos, tagsIds } = req.body;
    const errors = [];

    // Validar nombre
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
        errors.push({ field: 'nombre', message: 'El nombre es obligatorio y debe tener al menos 2 caracteres.' });
    } else if (nombre.length > 100) {
        errors.push({ field: 'nombre', message: 'El nombre no puede exceder 100 caracteres.' });
    }

    // Validar fotos: array de 1 a 5 elementos en base64
    if (!fotos || !Array.isArray(fotos)) {
        errors.push({ field: 'fotos', message: 'Debe enviarse un arreglo de fotos en formato base64.' });
    } else if (fotos.length < 1 || fotos.length > 5) {
        errors.push({ field: 'fotos', message: 'Debe subir entre 1 y 5 fotos.' });
    } else {
        fotos.forEach((foto, index) => {
            if (typeof foto !== 'string') {
                errors.push({ field: `fotos[${index}]`, message: 'La foto debe ser un string base64.' });
            } else {
                const validation = validateBase64Image(foto);
                if (!validation.valid) {
                    errors.push({ field: `fotos[${index}]`, message: validation.message });
                }
            }
        });
    }

    // Validar tagsIds: array de UUIDs
    if (!tagsIds || !Array.isArray(tagsIds)) {
        errors.push({ field: 'tagsIds', message: 'Debe enviarse un arreglo de IDs de tags (tagsIds).' });
    } else if (tagsIds.length === 0) {
        errors.push({ field: 'tagsIds', message: 'Debe especificar al menos un tag válido.' });
    } else {
        const invalidTags = tagsIds.filter(t => !UUID_REGEX.test(String(t)));
        if (invalidTags.length > 0) {
            errors.push({ field: 'tagsIds', message: 'Todos los tagsIds deben ser UUIDs válidos.' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validateCreateMascota };
