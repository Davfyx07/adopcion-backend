/**
 * Validaciones para el endpoint POST /api/adopciones
 */
const validarRegistrarAdopcion = (req, res, next) => {
    const errors = [];
    const { id_mascota, id_adoptante } = req.body;

    if (id_mascota === undefined || id_mascota === null || id_mascota === '') {
        errors.push({ field: 'id_mascota', message: 'El campo id_mascota es requerido.' });
    } else if (!Number.isInteger(Number(id_mascota)) || Number(id_mascota) <= 0) {
        errors.push({ field: 'id_mascota', message: 'El campo id_mascota debe ser un entero positivo.' });
    }

    if (id_adoptante === undefined || id_adoptante === null || id_adoptante === '') {
        errors.push({ field: 'id_adoptante', message: 'El campo id_adoptante es requerido.' });
    } else if (!Number.isInteger(Number(id_adoptante)) || Number(id_adoptante) <= 0) {
        errors.push({ field: 'id_adoptante', message: 'El campo id_adoptante debe ser un entero positivo.' });
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

module.exports = { validarRegistrarAdopcion };
