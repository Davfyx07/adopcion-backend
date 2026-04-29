const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const isTokenBlacklisted = async (token) => {
    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const result = await prisma.blacklist_token.findFirst({
        where: {
            token_hash: tokenHash,
            fecha_expiracion: { gt: new Date() }
        },
        select: { id: true }
    });

    return result !== null;
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
