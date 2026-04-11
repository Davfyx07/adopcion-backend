/**
 * Middleware de validación para HU-AL-01
 * Validación del perfil institucional del Albergue
 * 
 * Campos obligatorios según HU y esquema BD:
 * - nombre_albergue (3-150 chars)
 * - nit (formato colombiano: 123456789-0)
 * - descripcion (mínimo 20 chars)
 * - whatsapp (formato internacional: +573001234567)
 * - logo (validado por multer, aquí se verifica presencia)
 * 
 * Campos opcionales:
 * - sitio_web (si se envía, debe ser URL válida)
 */

const validateAlbergueProfile = (req, res, next) => {
    const { nombre_albergue, nit, descripcion, whatsapp, sitio_web } = req.body;
    const errors = [];

    // 1. Nombre del albergue: obligatorio, 3-150 caracteres
    if (!nombre_albergue || typeof nombre_albergue !== 'string' || nombre_albergue.trim().length < 3) {
        errors.push({
            field: 'nombre_albergue',
            message: 'El nombre del albergue es obligatorio y debe tener al menos 3 caracteres.',
        });
    } else if (nombre_albergue.trim().length > 150) {
        errors.push({
            field: 'nombre_albergue',
            message: 'El nombre del albergue no puede exceder los 150 caracteres.',
        });
    }

    // 2. NIT: obligatorio, formato colombiano (9 dígitos - 1 dígito verificación)
    // Acepta formatos: 900123456-7, 900.123.456-7, 12345678-9 (persona natural)
    const nitRegex = /^\d{6,9}-\d{1}$/;
    const nitClean = nit ? nit.replace(/\./g, '').trim() : '';
    if (!nit || !nitRegex.test(nitClean)) {
        errors.push({
            field: 'nit',
            message: 'El NIT es obligatorio y debe tener formato válido (ej: 900123456-7).',
        });
    }

    // 3. Descripción: obligatorio, mínimo 20 caracteres
    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim().length < 20) {
        errors.push({
            field: 'descripcion',
            message: 'La descripción es obligatoria y debe tener al menos 20 caracteres.',
        });
    }

    // 4. WhatsApp institucional: obligatorio, formato internacional
    // Acepta: +573001234567, 3001234567, +57 300 123 4567
    const whatsappClean = whatsapp ? whatsapp.replace(/[\s()-]/g, '') : '';
    const whatsappRegex = /^\+?\d{7,15}$/;
    if (!whatsapp || !whatsappRegex.test(whatsappClean)) {
        errors.push({
            field: 'whatsapp',
            message: 'El número de WhatsApp es obligatorio y debe ser un número válido (ej: +573001234567).',
        });
    }

    // 5. Logo: verificar que multer procesó el archivo
    if (!req.file) {
        errors.push({
            field: 'logo',
            message: 'El logo institucional es obligatorio (JPG o PNG, máximo 5MB).',
        });
    }

    // 6. Sitio web: opcional, pero si se envía debe ser URL válida
    if (sitio_web && sitio_web.trim() !== '') {
        const urlRegex = /^https?:\/\/.+\..+/;
        if (!urlRegex.test(sitio_web.trim())) {
            errors.push({
                field: 'sitio_web',
                message: 'El sitio web debe tener un formato de URL válido (ej: https://www.ejemplo.com).',
            });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validateAlbergueProfile };
