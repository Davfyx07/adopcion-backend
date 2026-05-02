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
  const id = parseInt(req.params.id);
  const result = await tagService.updateTag(id, req.body, req.user.id, ip);

  if (!result.success) return res.status(result.status).json(result);

  res.json({ success: true, data: result.data });
};

const deleteTag = async (req, res) => {
  const ip = req.ip;
  const id = parseInt(req.params.id);
  const result = await tagService.deleteTag(id, req.user.id, ip);

  if (!result.success) return res.status(result.status).json(result);

  res.json({ success: true });
};

const addOpciones = async (req, res) => {
  const ip = req.ip;
  const id = parseInt(req.params.id);
  const result = await tagService.addOpciones(
    id,
    req.body.opciones,
    req.user.id,
    ip
  );

  if (!result.success) return res.status(result.status).json(result);

  res.status(201).json({ success: true, data: result.data });
};

const deleteOpcion = async (req, res) => {
  const ip = req.ip;
  const idTag = parseInt(req.params.id);
  const idOpcion = parseInt(req.params.idOpcion);
  const result = await tagService.deleteOpcion(
    idTag,
    idOpcion,
    req.user.id,
    ip
  );

  if (!result.success) return res.status(result.status).json(result);

  res.json({ success: true });
};

module.exports = {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  addOpciones,
  deleteOpcion
};