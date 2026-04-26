const tagService = require('../services/tagService');

const getTags = async (req, res) => {
    const { estado } = req.query;

    const tags = await tagService.getTags(estado);

    res.json({ success: true, data: tags });
};

const createTag = async (req, res) => {
    const ip = req.ip;
    const result = await tagService.createTag(req.body, req.user.id, ip);

    if (!result.success) return res.status(result.status).json(result);

    res.status(201).json({ success: true, data: result.data });
};

const updateTag = async (req, res) => {
    const ip = req.ip;
    const result = await tagService.updateTag(req.params.id, req.body, req.user.id, ip);

    if (!result.success) return res.status(result.status).json(result);

    res.json({ success: true, data: result.data });
};

const deleteTag = async (req, res) => {
    const ip = req.ip;
    const result = await tagService.deleteTag(req.params.id, req.user.id, ip);

    if (!result.success) return res.status(result.status).json(result);

    res.json({ success: true });
};

const addOpciones = async (req, res) => {
    const ip = req.ip;
    const result = await tagService.addOpciones(
        req.params.id,
        req.body.opciones,
        req.user.id,
        ip
    );

    res.json(result);
};

module.exports = {
    getTags,
    createTag,
    updateTag,
    deleteTag,
    addOpciones
};