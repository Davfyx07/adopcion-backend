/**
 * Validaciones para HU-US-02: Creación de perfil adoptante
 */

// Teléfono colombiano: 10 dígitos comenzando con 3, o con prefijo +57
// También acepta fijos: 7 dígitos
const TELEFONO_REGEX = /^(\+?57)?3[0-9]{9}$|^[2-8][0-9]{6}$/;

const validatePerfilAdoptante = (req, res, next) => {
    const { telefono, ciudad, direccion, tags } = req.body;
    const errors = [];

    // Teléfono obligatorio y con formato válido
    if (!telefono) {
        errors.push({ field: 'telefono', message: 'El teléfono es obligatorio.' });
    } else {
        const telefonoLimpio = telefono.replace(/[\s\-]/g, '');
        if (!TELEFONO_REGEX.test(telefonoLimpio)) {
            errors.push({
                field: 'telefono',
                message: 'El teléfono debe ser un número colombiano válido (ej: 3001234567 o +573001234567).',
            });
        }
    }

    // Ciudad obligatoria
    if (!ciudad || ciudad.trim().length < 2 || ciudad.trim().length > 100) {
        errors.push({ field: 'ciudad', message: 'La ciudad es obligatoria (entre 2 y 100 caracteres).' });
    }

    // Dirección obligatoria
    if (!direccion || direccion.trim().length < 5 || direccion.trim().length > 255) {
        errors.push({ field: 'direccion', message: 'La dirección es obligatoria (entre 5 y 255 caracteres).' });
    }

    // Tags: debe ser un array (o string JSON parseable)
    if (tags !== undefined) {
        try {
            const parsed = Array.isArray(tags) ? tags : JSON.parse(tags);
            if (!Array.isArray(parsed)) throw new Error();
        } catch {
            errors.push({ field: 'tags', message: 'El campo tags debe ser un arreglo de IDs numéricos.' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validatePerfilAdoptante };
