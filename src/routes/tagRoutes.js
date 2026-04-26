const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const { allowRoles } = require('../middlewares/roleMiddleware');

const {
    validateCreateTag,
    validateUpdateTag
} = require('../middlewares/tagValidation');

const {
    getTags,
    createTag,
    updateTag,
    deleteTag,
    addOpciones
} = require('../controllers/tagController');

router.get('/admin/etiquetas', authMiddleware, allowRoles('admin'), getTags);

router.post('/admin/etiquetas',
    authMiddleware,
    allowRoles('admin'),
    validateCreateTag,
    createTag
);

router.put('/admin/etiquetas/:id',
    authMiddleware,
    allowRoles('admin'),
    validateUpdateTag,
    updateTag
);

router.delete('/admin/etiquetas/:id',
    authMiddleware,
    allowRoles('admin'),
    deleteTag
);

router.post('/admin/etiquetas/:id/opciones',
    authMiddleware,
    allowRoles('admin'),
    addOpciones
);

module.exports = router;