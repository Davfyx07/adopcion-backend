const { validateBase64Image } = require('../services/storageService');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateCreateMascota = (req, res, next) => {
    const { nombre, fotos, tagsIds } = req.body;
    const errors = [];

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
        errors.push({ field: 'nombre', message: 'El nombre es obligatorio y debe tener al menos 2 caracteres.' });
    } else if (nombre.length > 100) {
        errors.push({ field: 'nombre', message: 'El nombre no puede exceder 100 caracteres.' });
    }

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

    if (!tagsIds || !Array.isArray(tagsIds)) {
        errors.push({ field: 'tagsIds', message: 'Debe enviarse un arreglo de IDs de tags (tagsIds).' });
    } else if (tagsIds.length === 0) {
        errors.push({ field: 'tagsIds', message: 'Debe especificar al menos un tag válido.' });
    } else {
        const invalidTags = tagsIds.filter((t) => !UUID_REGEX.test(String(t)));
        if (invalidTags.length > 0) {
            errors.push({ field: 'tagsIds', message: 'Todos los tagsIds deben ser UUIDs válidos.' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    return next();
};

const validateUUIDParam = (req, res, next) => {
    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
        return res.status(400).json({ success: false, message: 'ID de mascota inválido (debe ser UUID).' });
    }
    return next();
};

const validateUpdateMascota = (req, res, next) => {
    const { nombre, descripcion, estado_adopcion, updated_at, fotos, fotos_eliminadas, tagsIds } = req.body;
    const errors = [];

    if (nombre !== undefined && (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.trim().length > 100)) {
        errors.push({ field: 'nombre', message: 'El nombre debe tener entre 2 y 100 caracteres.' });
    }

    if (descripcion !== undefined && (typeof descripcion !== 'string' || descripcion.trim().length < 10)) {
        errors.push({ field: 'descripcion', message: 'La descripción debe tener al menos 10 caracteres.' });
    }

    const estadosValidos = ['disponible', 'en_proceso', 'adoptado', 'pausado'];
    if (estado_adopcion !== undefined && !estadosValidos.includes(estado_adopcion)) {
        errors.push({ field: 'estado_adopcion', message: `El estado debe ser uno de: ${estadosValidos.join(', ')}` });
    }

    if (!updated_at) {
        errors.push({ field: 'updated_at', message: 'El campo updated_at es obligatorio para el bloqueo optimista.' });
    } else if (Number.isNaN(new Date(updated_at).getTime())) {
        errors.push({ field: 'updated_at', message: 'updated_at debe ser una fecha válida en formato ISO.' });
    }

    if (fotos) {
        if (!Array.isArray(fotos)) {
            errors.push({ field: 'fotos', message: 'fotos debe ser un arreglo.' });
        } else {
            fotos.forEach((f, index) => {
                if (f.orden === undefined) errors.push({ field: `fotos[${index}]`, message: 'Cada foto debe incluir un orden.' });
                if (!f.base64 && !f.id_foto) {
                    errors.push({ field: `fotos[${index}]`, message: 'Cada foto debe tener id_foto (existente) o base64 (nueva).' });
                }
                if (f.id_foto && !UUID_REGEX.test(String(f.id_foto))) {
                    errors.push({ field: `fotos[${index}].id_foto`, message: 'id_foto debe ser UUID válido.' });
                }
                if (f.base64) {
                    const check = validateBase64Image(f.base64);
                    if (!check.valid) errors.push({ field: `fotos[${index}]`, message: check.message });
                }
            });
        }
    }

    if (fotos_eliminadas && !Array.isArray(fotos_eliminadas)) {
        errors.push({ field: 'fotos_eliminadas', message: 'fotos_eliminadas debe ser un arreglo de IDs.' });
    } else if (Array.isArray(fotos_eliminadas)) {
        const invalidFotos = fotos_eliminadas.filter((id) => !UUID_REGEX.test(String(id)));
        if (invalidFotos.length > 0) {
            errors.push({ field: 'fotos_eliminadas', message: 'Todos los IDs en fotos_eliminadas deben ser UUID válidos.' });
        }
    }

    if (tagsIds) {
        if (!Array.isArray(tagsIds)) {
            errors.push({ field: 'tagsIds', message: 'tagsIds debe ser un arreglo de UUIDs.' });
        } else {
            const invalidTags = tagsIds.filter((t) => !UUID_REGEX.test(String(t)));
            if (invalidTags.length > 0) {
                errors.push({ field: 'tagsIds', message: 'Todos los tagsIds deben ser UUIDs válidos.' });
            }
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    return next();
};

const validateCambioEstado = (req, res, next) => {
    const { estado, motivo } = req.body;
    const errors = [];
    const estadosPermitidos = ['disponible', 'en_proceso', 'adoptado', 'oculto', 'inactivo', 'archivado', 'pausado'];

    if (!estado || !estadosPermitidos.includes(estado)) {
        errors.push({
            field: 'estado',
            message: `El estado es inválido o no fue proporcionado. Valores permitidos: ${estadosPermitidos.join(', ')}`
        });
    }

    const requiereMotivo = ['oculto', 'inactivo', 'archivado'].includes(estado);
    if (requiereMotivo && (!motivo || typeof motivo !== 'string' || motivo.trim().length < 5)) {
        errors.push({ field: 'motivo', message: 'El motivo es obligatorio para este estado y debe tener al menos 5 caracteres.' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    return next();
};

const validateFeedQuery = (req, res, next) => {
    const { page, limit, tipo, tamaño, edad, ciudad } = req.query;
    const errors = [];

    if (page !== undefined && (!/^[1-9]\d*$/.test(page))) {
        errors.push({ field: 'page', message: 'page debe ser un entero positivo.' });
    }

    if (limit !== undefined && (!/^[1-9]\d*$/.test(limit) || parseInt(limit) > 50)) {
        errors.push({ field: 'limit', message: 'limit debe ser un entero entre 1 y 50.' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    req.query.page = parseInt(page) || 1;
    req.query.limit = parseInt(limit) || 10;

    return next();
};

module.exports = {
    validateCreateMascota,
    validateUUIDParam,
    validateUpdateMascota,
    validateCambioEstado,
    validateFeedQuery
};
