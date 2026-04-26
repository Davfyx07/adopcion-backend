/**
 * Middleware de autorización por rol (HU-AUTH-05 / Reutilizable)
 * 
 * Verifica que el usuario autenticado tenga uno de los roles permitidos.
 * Debe ejecutarse DESPUÉS de authMiddleware (necesita req.user.role).
 * 
 * @param {string[]} allowedRoles - Array de roles permitidos (ej: ['albergue', 'admin'])
 * @returns {Function} Middleware de Express
 * 
 * Uso: router.post('/perfil', authMiddleware, authorizeRole(['albergue']), controller)
 */
const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        // req.user viene del authMiddleware (JWT decodificado)
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                message: 'Se requiere autenticación.',
            });
        }

        const userRole = req.user.role.toLowerCase();

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para acceder a este recurso.',
            });
        }

        next();
    };
};

module.exports = authorizeRole;
