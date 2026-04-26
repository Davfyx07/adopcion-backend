const validateCreateTag = (req, res, next) => {
    const { nombre_tag, peso_matching, categoria, es_filtro_absoluto } = req.body;
    const errors = [];

    if (!nombre_tag || typeof nombre_tag !== 'string' || nombre_tag.trim().length < 2 || nombre_tag.trim().length > 100) {
        errors.push('nombre_tag debe tener entre 2 y 100 caracteres.');
    }

    if (peso_matching === undefined || typeof peso_matching !== 'number' || Number.isNaN(peso_matching) || peso_matching < 0 || peso_matching > 100) {
        errors.push('peso_matching debe ser un número entre 0 y 100.');
    }

    if (categoria !== undefined && (typeof categoria !== 'string' || categoria.trim().length < 2 || categoria.trim().length > 50)) {
        errors.push('categoria debe tener entre 2 y 50 caracteres.');
    }

    if (es_filtro_absoluto !== undefined && typeof es_filtro_absoluto !== 'boolean') {
        errors.push('es_filtro_absoluto debe ser booleano.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    next();
};

const validateUpdateTag = (req, res, next) => {
    const { nombre_tag, peso_matching, estado, es_filtro_absoluto, categoria } = req.body;
    const errors = [];

    if (nombre_tag !== undefined && (typeof nombre_tag !== 'string' || nombre_tag.trim().length < 2 || nombre_tag.trim().length > 100)) {
        errors.push('nombre_tag debe tener entre 2 y 100 caracteres.');
    }

    if (peso_matching !== undefined && (typeof peso_matching !== 'number' || Number.isNaN(peso_matching) || peso_matching < 0 || peso_matching > 100)) {
        errors.push('peso_matching debe ser un número entre 0 y 100.');
    }

    if (estado !== undefined && !['activo', 'inactivo'].includes(estado)) {
        errors.push('estado debe ser activo o inactivo.');
    }

    if (es_filtro_absoluto !== undefined && typeof es_filtro_absoluto !== 'boolean') {
        errors.push('es_filtro_absoluto debe ser booleano.');
    }

    if (categoria !== undefined && (typeof categoria !== 'string' || categoria.trim().length < 2 || categoria.trim().length > 50)) {
        errors.push('categoria debe tener entre 2 y 50 caracteres.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    next();
};

module.exports = {
    validateCreateTag,
    validateUpdateTag
};
