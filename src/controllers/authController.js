const { registerUser, loginUser, forgotPassword, resetPassword } = require('../services/authService');

/**
 * POST /api/auth/register
 * Registro exitoso, atómico y respuestas estandarizadas
 */
const register = async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await registerUser({ email, password, role, ip });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
                action: result.action || null,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Cuenta creada exitosamente.',
            data: result.data,
        });

    } catch (err) {
        // Error atómico de servidor — no exponer detalles internos
        console.error('[auth.controller] register:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error al crear tu cuenta. Intenta de nuevo más tarde.',
        });
    }
};

/**
 * POST /api/auth/login
 * Maneja el inicio de sesión y la respuesta con JWT
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await loginUser({ email, password, ip });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Inicio de sesión exitoso.',
            data: result.data,
        });

    } catch (err) {
        console.error('[auth.controller] login:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error al iniciar sesión. Intenta de nuevo más tarde.',
        });
    }
};

const forgotPasswordController = async (req, res) => {
    try {
        const { email } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await forgotPassword({ email, ip });

        return res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (err) {
        console.error('[auth.controller] forgotPassword:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al procesar la solicitud de recuperación.'
        });
    }
};

const resetPasswordController = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await resetPassword({ token, newPassword, ip });

        if (!result.success) {
            return res.status(result.status || 400).json({
                success: false,
                message: result.message
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (err) {
        console.error('[auth.controller] resetPassword:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al restablecer la contraseña.'
        });
    }
};

module.exports = {
    register,
    login,
    forgotPassword: forgotPasswordController,
    resetPassword: resetPasswordController
};
