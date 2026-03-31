const { registerUser, loginUser, forgotPassword, resetPassword } = require('../services/authService');

const register = async (req, res) => {
    try {
        const result = await registerUser(req.body);
        return res.status(201).json(result);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('[authController] Error en register:', error);
        return res.status(500).json({ message: 'Error al registrar el usuario.' });
    }
};

const login = async (req, res) => {
    try {
        const { correo, password } = req.body;
        const result = await loginUser(correo, password);
        return res.status(200).json(result);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('[authController] Error en login:', error);
        return res.status(500).json({ message: 'Error al iniciar sesión.' });
    }
};

const forgotPasswordController = async (req, res) => {
    try {
        const { correo } = req.body;

        if (!correo) {
            return res.status(400).json({ message: "El campo 'correo' es obligatorio." });
        }

        const result = await forgotPassword(correo);
        return res.status(200).json(result);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Error en forgotPassword:', error);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

const resetPasswordController = async (req, res) => {
    try {
        const { token, nuevaPassword } = req.body;

        if (!token || !nuevaPassword) {
            return res.status(400).json({ message: "Los campos 'token' y 'nuevaPassword' son obligatorios." });
        }

        if (nuevaPassword.length < 8) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
        }

        const result = await resetPassword(token, nuevaPassword);
        return res.status(200).json(result);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Error en resetPassword:', error);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

module.exports = {
    register,
    login,
    forgotPassword: forgotPasswordController,
    resetPassword: resetPasswordController
};
