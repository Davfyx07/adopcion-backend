/**
 * Validaciones para HU-US-01 y HU-US-02: Perfil adoptante
 * 
 * Adaptado al esquema real de BD (tabla Adoptante):
 *   - nombre_completo: obligatorio (NOT NULL en BD)
 *   - whatsapp: obligatorio (whatsapp_adoptante en BD)
 *   - ciudad: obligatorio
 *   - tags: array de UUIDs (opciones de Opcion_Tag)
 *   - foto: base64 opcional (foto_perfil en BD)
 */

// Teléfono colombiano: 10 dígitos comenzando con 3, o con prefijo +57
// También acepta fijos: 7 dígitos
const TELEFONO_REGEX = /^(\+?57)?3[0-9]{9}$|^[2-8][0-9]{6}$/;

// UUID v4 regex para validar IDs de tags
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validatePerfilAdoptante = (req, res, next) => {
    const { nombre_completo, whatsapp, ciudad, tags } = req.body;
    const errors = [];

    // Nombre completo obligatorio (NOT NULL en tabla Adoptante)
    if (!nombre_completo || typeof nombre_completo !== 'string' || nombre_completo.trim().length < 3) {
        errors.push({ field: 'nombre_completo', message: 'El nombre completo es obligatorio (mínimo 3 caracteres).' });
    } else if (nombre_completo.trim().length > 150) {
        errors.push({ field: 'nombre_completo', message: 'El nombre no puede exceder 150 caracteres.' });
    }

    // WhatsApp obligatorio y con formato válido
    if (!whatsapp) {
        errors.push({ field: 'whatsapp', message: 'El número de WhatsApp es obligatorio.' });
    } else {
        const whatsappLimpio = whatsapp.replace(/[\s\-]/g, '');
        if (!TELEFONO_REGEX.test(whatsappLimpio)) {
            errors.push({
                field: 'whatsapp',
                message: 'El WhatsApp debe ser un número colombiano válido (ej: 3001234567 o +573001234567).',
            });
        }
    }

    // Ciudad obligatoria
    if (!ciudad || ciudad.trim().length < 2 || ciudad.trim().length > 100) {
        errors.push({ field: 'ciudad', message: 'La ciudad es obligatoria (entre 2 y 100 caracteres).' });
    }

    // Tags: debe ser un array de UUIDs válidos
    if (tags !== undefined) {
        try {
            const parsed = Array.isArray(tags) ? tags : JSON.parse(tags);
            if (!Array.isArray(parsed)) throw new Error();
            // Validar que cada tag sea un UUID válido
            const invalidTags = parsed.filter(t => !UUID_REGEX.test(String(t)));
            if (invalidTags.length > 0) {
                errors.push({ field: 'tags', message: 'Los tags deben ser IDs válidos (UUID).' });
            }
        } catch {
            errors.push({ field: 'tags', message: 'El campo tags debe ser un arreglo de IDs (UUID).' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

const validateUpdatePerfil = (req, res, next) => {
    const { nombre_completo, whatsapp, ciudad } = req.body;
    const errors = [];

    // Nombre completo obligatorio
    if (!nombre_completo || typeof nombre_completo !== 'string' || nombre_completo.trim().length < 3) {
        errors.push({ field: 'nombre_completo', message: 'El nombre completo es obligatorio (mínimo 3 caracteres).' });
    } else if (nombre_completo.trim().length > 150) {
        errors.push({ field: 'nombre_completo', message: 'El nombre no puede exceder 150 caracteres.' });
    }

    // WhatsApp obligatorio
    if (!whatsapp) {
        errors.push({ field: 'whatsapp', message: 'El número de WhatsApp es obligatorio.' });
    } else {
        const whatsappLimpio = whatsapp.replace(/[\s\-]/g, '');
        if (!TELEFONO_REGEX.test(whatsappLimpio)) {
            errors.push({
                field: 'whatsapp',
                message: 'El WhatsApp debe ser un número colombiano válido (ej: 3001234567 o +573001234567).',
            });
        }
    }

    // Ciudad obligatoria
    if (!ciudad || ciudad.trim().length < 2 || ciudad.trim().length > 100) {
        errors.push({ field: 'ciudad', message: 'La ciudad es obligatoria (entre 2 y 100 caracteres).' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

const validateUpdateTags = (req, res, next) => {
    const { tags } = req.body;
    const errors = [];

    if (tags === undefined) {
        errors.push({ field: 'tags', message: 'El campo tags es obligatorio.' });
    } else {
        try {
            const parsed = Array.isArray(tags) ? tags : JSON.parse(tags);
            if (!Array.isArray(parsed)) throw new Error();
            const invalidTags = parsed.filter(t => !UUID_REGEX.test(String(t)));
            if (invalidTags.length > 0) {
                errors.push({ field: 'tags', message: 'Los tags deben ser IDs válidos (UUID).' });
            }
        } catch {
            errors.push({ field: 'tags', message: 'El campo tags debe ser un arreglo de IDs (UUID).' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validatePerfilAdoptante, validateUpdatePerfil, validateUpdateTags };
