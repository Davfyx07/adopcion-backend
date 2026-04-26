const Joi = require('joi');

const createTagSchema = Joi.object({
    nombre_tag: Joi.string().max(100).required(),

    peso_matching: Joi.number()
        .min(0)
        .max(1)
        .required(),

    tipo: Joi.string()
        .valid('categorico', 'numerico', 'booleano')
        .required(),

    es_filtro_absoluto: Joi.boolean().optional()
});

const updateTagSchema = Joi.object({
    nombre_tag: Joi.string().max(100),
    peso_matching: Joi.number().min(0).max(1),
    estado: Joi.string().valid('activo', 'inactivo'),
    es_filtro_absoluto: Joi.boolean(),
    tipo: Joi.any().forbidden() // no editable
});

const validateCreateTag = (req, res, next) => {
    const { error } = createTagSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    next();
};

const validateUpdateTag = (req, res, next) => {
    const { error } = updateTagSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    next();
};

module.exports = {
    validateCreateTag,
    validateUpdateTag
};