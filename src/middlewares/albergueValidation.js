/**
 * Validaciones para Albergue
 * HU-AL-01: Creación de perfil (POST)
 * HU-AL-02: Edición de perfil (PUT)
 */

const { validateBase64Image } = require('../services/storageService');

// NIT colombiano: 6-9 dígitos + guión + 1 dígito verificación
// Acepta: 900123456-7, 900.123.456-7, 12345678-9
const NIT_REGEX = /^\d{6,9}-\d{1}$/;

// WhatsApp internacional
const WHATSAPP_REGEX = /^\+?\d{7,15}$/;

/**
 * Validación para CREAR perfil (POST /api/albergue/perfil)
 */
const validateCreatePerfil = (req, res, next) => {
    const { nombre_albergue, nit, descripcion, whatsapp, sitio_web, logo } = req.body;
    const errors = [];

    // Nombre del albergue: obligatorio, 3-150 caracteres
    if (!nombre_albergue || typeof nombre_albergue !== 'string' || nombre_albergue.trim().length < 3) {
        errors.push({ field: 'nombre_albergue', message: 'El nombre del albergue es obligatorio y debe tener al menos 3 caracteres.' });
    } else if (nombre_albergue.trim().length > 150) {
        errors.push({ field: 'nombre_albergue', message: 'El nombre del albergue no puede exceder los 150 caracteres.' });
    }

    // NIT: obligatorio, formato colombiano
    const nitClean = nit ? nit.replace(/\./g, '').trim() : '';
    if (!nit || !NIT_REGEX.test(nitClean)) {
        errors.push({ field: 'nit', message: 'El NIT es obligatorio y debe tener formato válido (ej: 900123456-7).' });
    }

    // Descripción: obligatorio, mínimo 20 caracteres
    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim().length < 20) {
        errors.push({ field: 'descripcion', message: 'La descripción es obligatoria y debe tener al menos 20 caracteres.' });
    }

    // WhatsApp: obligatorio
    const whatsappClean = whatsapp ? whatsapp.replace(/[\s()-]/g, '') : '';
    if (!whatsapp || !WHATSAPP_REGEX.test(whatsappClean)) {
        errors.push({ field: 'whatsapp', message: 'El número de WhatsApp es obligatorio (ej: +573001234567).' });
    }

    // Logo: opcional, pero si se envía debe ser base64 válido
    if (logo) {
        const validacion = validateBase64Image(logo);
        if (!validacion.valid) {
            errors.push({ field: 'logo', message: validacion.message });
        }
    }

    // Sitio web: opcional, pero si se envía debe ser URL válida
    if (sitio_web && sitio_web.trim() !== '') {
        const urlRegex = /^https?:\/\/.+\..+/;
        if (!urlRegex.test(sitio_web.trim())) {
            errors.push({ field: 'sitio_web', message: 'El sitio web debe ser una URL válida (ej: https://www.ejemplo.com).' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

/**
 * Validación para ACTUALIZAR perfil (PUT /api/albergue/perfil)
 * NIT NO se acepta aquí (bloqueado en el service también)
 */
const validateUpdatePerfil = (req, res, next) => {
    const { descripcion, whatsapp_actual, sitio_web, logo } = req.body;
    const errors = [];

    // Descripción: si se envía, mínimo 20 caracteres
    if (descripcion !== undefined && descripcion !== null) {
        if (typeof descripcion !== 'string' || descripcion.trim().length < 20) {
            errors.push({ field: 'descripcion', message: 'La descripción debe tener al menos 20 caracteres.' });
        }
    }

    // WhatsApp: si se envía, formato válido
    if (whatsapp_actual !== undefined && whatsapp_actual !== null) {
        const whatsappClean = whatsapp_actual.replace(/[\s()-]/g, '');
        if (!WHATSAPP_REGEX.test(whatsappClean)) {
            errors.push({ field: 'whatsapp_actual', message: 'El WhatsApp debe ser un número válido (ej: +573001234567).' });
        }
    }

    // Logo: si se envía, validar base64
    if (logo) {
        const validacion = validateBase64Image(logo);
        if (!validacion.valid) {
            errors.push({ field: 'logo', message: validacion.message });
        }
    }

    // Sitio web: si se envía, URL válida
    if (sitio_web && sitio_web.trim() !== '') {
        const urlRegex = /^https?:\/\/.+\..+/;
        if (!urlRegex.test(sitio_web.trim())) {
            errors.push({ field: 'sitio_web', message: 'El sitio web debe ser una URL válida.' });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validateCreatePerfil, validateUpdatePerfil };