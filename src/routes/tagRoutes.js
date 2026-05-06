const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

const {
    validateCreateTag,
    validateUpdateTag
} = require('../middlewares/tagValidation');

const {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  addOpciones,
  deleteOpcion
} = require('../controllers/tagController');

router.get('/admin/etiquetas', authMiddleware, authorizeRole(['admin']), getTags);

router.post('/admin/etiquetas',
    authMiddleware,
    authorizeRole(['admin']),
    validateCreateTag,
    createTag
);

router.put('/admin/etiquetas/:id',
    authMiddleware,
    authorizeRole(['admin']),
    validateUpdateTag,
    updateTag
);

router.delete('/admin/etiquetas/:id',
    authMiddleware,
    authorizeRole(['admin']),
    deleteTag
);

router.post('/admin/etiquetas/:id/opciones',
  authMiddleware,
  authorizeRole(['admin']),
  addOpciones
);

router.delete('/admin/etiquetas/:id/opciones/:idOpcion',
  authMiddleware,
  authorizeRole(['admin']),
  deleteOpcion
);

module.exports = router;
