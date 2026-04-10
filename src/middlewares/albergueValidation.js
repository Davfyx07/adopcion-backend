const Joi = require('joi');

const updatePerfilSchema = Joi.object({
    descripcion: Joi.string().max(1000).allow('', null),

    whatsapp_actual: Joi.string()
        .pattern(/^[0-9+\- ]{7,20}$/)
        .message('Número de WhatsApp inválido'),

    sitio_web: Joi.string().uri().allow('', null),

    logo: Joi.string().allow('', null), // base64 o url

    nit: Joi.any().forbidden() //  bloqueado
});

const validateUpdatePerfil = (req, res, next) => {
    const { error } = updatePerfilSchema.validate(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }

    next();
};

module.exports = {
    validateUpdatePerfil
};