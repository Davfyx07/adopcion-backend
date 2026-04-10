const {
    getPerfilAlbergue,
    updatePerfilAlbergue
} = require('../services/albergueService');

const getPerfil = async (req, res) => {
    try {
        const perfil = await getPerfilAlbergue(req.user.id);

        if (!perfil) {
            return res.status(404).json({
                success: false,
                message: 'Perfil no encontrado'
            });
        }

        res.json({
            success: true,
            data: perfil
        });

    } catch (err) {
        console.error('[albergue] getPerfil:', err.message);
        res.status(500).json({ success: false });
    }
};

const updatePerfil = async (req, res) => {
    try {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await updatePerfilAlbergue(
            req.user.id,
            req.body,
            ip
        );

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        res.json({
            success: true,
            message: 'Perfil actualizado',
            data: result.data
        });

    } catch (err) {
        console.error('[albergue] updatePerfil:', err.message);
        res.status(500).json({ success: false });
    }
};

module.exports = {
    getPerfil,
    updatePerfil
};