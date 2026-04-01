const { registerUser } = require('../services/authService');

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

module.exports = { register };
