const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const isTokenBlacklisted = async (token) => {
    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const result = await pool.query(
        `SELECT 1 
         FROM Blacklist_Token 
         WHERE token_hash = $1 
         AND fecha_expiracion > NOW()`,
        [tokenHash]
    );

    return result.rows.length > 0;
};

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token requerido o formato inválido.'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET no definido');
        }

        // 🔐 1. Verificar JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 🚫 2. Validar blacklist
        if (await isTokenBlacklisted(token)) {
            return res.status(401).json({
                success: false,
                message: 'Token inválido (logout)'
            });
        }

        // 📌 Guardar en request
        req.user = decoded;
        req.token = token;

        next();

    } catch (err) {
        let message = 'Token inválido.';

        if (err.name === 'TokenExpiredError') {
            message = 'Token expirado.';
        }

        return res.status(401).json({
            success: false,
            message
        });
    }
};

module.exports = authMiddleware;