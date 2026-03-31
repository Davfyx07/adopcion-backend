/**
 * Middleware de validación para registro (HU-AUTH-01)
 */
const validate = (req, res, next) => {
    const { nombre, correo, password, termsAccepted } = req.body;
    const errors = [];

    if (!nombre || nombre.trim() === '') errors.push({ field: 'nombre', message: 'El nombre es obligatorio.' });
    if (!correo || !/^\S+@\S+\.\S+$/.test(correo)) errors.push({ field: 'correo', message: 'Correo electrónico inválido.' });
    if (!password || password.length < 8) errors.push({ field: 'password', message: 'La contraseña debe tener al menos 8 caracteres.' });
    
    // Este campo puede ser opcional dependiendo de la implementación de HU-AUTH-01, 
    // pero lo incluimos si está en el estándar del repositorio.
    // if (!termsAccepted) errors.push({ field: 'termsAccepted', message: 'Debes aceptar los términos y condiciones.' });

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = validate;
