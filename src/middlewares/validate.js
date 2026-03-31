/**
 * Middleware de validación para HU-AUTH-01
 * Cubre criterios de aceptación: 3, 4, 5, 6, 7
 */

const validateRegister = (req, res, next) => {
    const { email, password, confirmPassword, role, termsAccepted } = req.body;
    const errors = [];

    // CA-3: Formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push({ field: 'email', message: 'El correo no tiene un formato válido.' });
    }

    // CA-4: Fortaleza de contraseña
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!password || !passwordRegex.test(password)) {
        errors.push({
            field: 'password',
            message: 'La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número.',
        });
    }

    // CA-5: Contraseñas coinciden
    if (password !== confirmPassword) {
        errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden.' });
    }

    // CA-7: Rol obligatorio
    const validRoles = ['adoptante', 'albergue'];
    if (!role || !validRoles.includes(role ? role.toLowerCase() : '')) {
        errors.push({ field: 'role', message: 'Debes seleccionar un rol: Adoptante o Albergue.' });
    }

    // CA-6: Términos y condiciones
    if (!termsAccepted || termsAccepted !== true) {
        errors.push({ field: 'termsAccepted', message: 'Debes aceptar los Términos y Condiciones.' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

/**
 * Middleware de validación para Login (HU-AUTH-02)
 */
const validateLogin = (req, res, next) => {
    const { email, password } = req.body;
    const errors = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push({ field: 'email', message: 'El correo no tiene un formato válido.' });
    }

    if (!password || typeof password !== 'string') {
        errors.push({ field: 'password', message: 'La contraseña es obligatoria.' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};
const validateForgotPassword = (req, res, next) => {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            errors: [{ field: 'email', message: 'El correo no tiene un formato válido.' }]
        });
    }
    next();
};

const validateResetPassword = (req, res, next) => {
    const { token, newPassword } = req.body;
    const errors = [];

    if (!token) errors.push({ field: 'token', message: 'El token es obligatorio.' });

    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!newPassword || !passwordRegex.test(newPassword)) {
        errors.push({
            field: 'newPassword',
            message: 'La nueva contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número.',
        });
    }

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};
module.exports = { validateRegister, validateLogin, validateForgotPassword, validateResetPassword };
