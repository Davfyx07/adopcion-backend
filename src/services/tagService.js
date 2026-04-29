const pool = require('../config/db');

const getTags = async (estado) => {
    let query = 'SELECT * FROM tag';
    const params = [];

    if (estado) {
        params.push(estado);
        query += ` WHERE estado = $${params.length}`;
    }

    const res = await pool.query(query, params);
    return res.rows;
};

const createTag = async (data, userId, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // validar nombre único
        const exists = await client.query(
            `SELECT 1 FROM tag WHERE LOWER(nombre_tag) = $1`,
            [data.nombre_tag.toLowerCase()]
        );

        if (exists.rows.length > 0) {
            return { success: false, status: 409, message: 'Nombre de tag ya existe' };
        }

        const result = await client.query(
            `INSERT INTO tag (nombre_tag, categoria, peso_matching, es_filtro_absoluto, estado)
             VALUES ($1, $2, $3, $4, 'activo')
             RETURNING *`,
            [
                data.nombre_tag,
                data.categoria || 'General',
                data.peso_matching,
                data.es_filtro_absoluto || false
            ]
        );

        const tag = result.rows[0];

        //  auditoría
        await client.query(
            `INSERT INTO log_auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_nuevo, ip)
            VALUES ($1, 'CREATE_TAG', 'tag', $2, $3, $4)`,
            [userId, tag.id_tag, tag, ip]
        );

        await client.query('COMMIT');

        return { success: true, data: tag };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const updateTag = async (id, data, userId, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentRes = await client.query(
            'SELECT * FROM tag WHERE id_tag = $1',
            [id]
        );

        if (currentRes.rows.length === 0) {
            return { success: false, status: 404, message: 'Tag no encontrado' };
        }

        const current = currentRes.rows[0];

        //  evitar duplicados
        if (data.nombre_tag) {
            const exists = await client.query(
                `SELECT 1 FROM tag WHERE LOWER(nombre_tag) = $1 AND id_tag <> $2`,
                [data.nombre_tag.toLowerCase(), id]
            );

            if (exists.rows.length > 0) {
                return { success: false, status: 409, message: 'Nombre duplicado' };
            }
        }

        const result = await client.query(
            `UPDATE tag SET
                nombre_tag = COALESCE($1, nombre_tag),
                categoria = COALESCE($2, categoria),
                peso_matching = COALESCE($3, peso_matching),
                estado = COALESCE($4, estado),
                es_filtro_absoluto = COALESCE($5, es_filtro_absoluto)
             WHERE id_tag = $6
             RETURNING *`,
            [
                data.nombre_tag ?? null,
                data.categoria ?? null,
                data.peso_matching ?? null,
                data.estado ?? null,
                data.es_filtro_absoluto ?? null,
                id
            ]
        );

        const updated = result.rows[0];

        //  recalcular embeddings (simulado async)
        if (data.peso_matching && data.peso_matching !== current.peso_matching) {
            console.log('Recalcular embeddings...');
        }

        await client.query(
            `INSERT INTO log_auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip)
            VALUES ($1, 'UPDATE_TAG', 'tag', $2, $3, $4, $5)`,
            [userId, id, current, updated, ip]
        );

        await client.query('COMMIT');

        return { success: true, data: updated };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const deleteTag = async (id, userId, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const res = await client.query(
            `SELECT * FROM tag WHERE id_tag = $1`,
            [id]
        );

        if (res.rows.length === 0) {
            return { success: false, status: 404, message: 'Tag no encontrado' };
        }

        const tag = res.rows[0];

        //  ejemplo de obligatorio
        if (tag.nombre_tag.toLowerCase().includes('tipo')) {
            return { success: false, status: 400, message: 'Tag obligatorio no eliminable' };
        }

        await client.query('UPDATE tag SET estado = $1 WHERE id_tag = $2', ['inactivo', id]);

        await client.query(
            `INSERT INTO log_auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, ip)
            VALUES ($1, 'DELETE_TAG', 'tag', $2, $3, $4)`,
            [userId, id, tag, ip]
        );

        await client.query('COMMIT');

        return { success: true };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const addOpciones = async (id, opciones, userId, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (!Array.isArray(opciones) || opciones.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'Debes enviar al menos una opción.' };
        }

        for (const op of opciones) {
            await client.query(
                `INSERT INTO opcion_tag (id_tag, valor)
                 VALUES ($1, $2)`,
                [id, op]
            );
        }

        await client.query(
            `INSERT INTO log_auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_nuevo, ip)
            VALUES ($1, 'ADD_OPCIONES_TAG', 'tag', $2, $3, $4)`,
            [userId, id, opciones, ip]
        );

        await client.query('COMMIT');

        return { success: true };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getTags,
    createTag,
    updateTag,
    deleteTag,
    addOpciones
};
