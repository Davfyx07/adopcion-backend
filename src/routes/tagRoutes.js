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

router.get('/admin/etiquetas', authMiddleware, authorizeRole(['administrador']), getTags);

router.post('/admin/etiquetas',
    authMiddleware,
    authorizeRole(['administrador']),
    validateCreateTag,
    createTag
);

router.put('/admin/etiquetas/:id',
    authMiddleware,
    authorizeRole(['administrador']),
    validateUpdateTag,
    updateTag
);

router.delete('/admin/etiquetas/:id',
    authMiddleware,
    authorizeRole(['administrador']),
    deleteTag
);

router.post('/admin/etiquetas/:id/opciones',
  authMiddleware,
  authorizeRole(['administrador']),
  addOpciones
);

router.delete('/admin/etiquetas/:id/opciones/:idOpcion',
  authMiddleware,
  authorizeRole(['administrador']),
  deleteOpcion
);

module.exports = router;
