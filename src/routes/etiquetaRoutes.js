const express = require('express');
const { listarEtiquetas } = require('../controllers/etiquetaController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Etiquetas
 *   description: Catálogo de etiquetas para perfil de adoptante
 */

/**
 * @swagger
 * /api/etiquetas:
 *   get:
 *     summary: Obtener catálogo de etiquetas
 *     description: >
 *       Retorna todas las etiquetas disponibles para el perfil de adoptante,
 *       agrupadas por categoría. Las etiquetas marcadas como obligatorias
 *       deben ser seleccionadas al crear el perfil.
 *     tags: [Etiquetas]
 *     responses:
 *       200:
 *         description: Lista de etiquetas disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_opcion:
 *                         type: string
 *                         format: uuid
 *                       valor:
 *                         type: string
 *                       categoria:
 *                         type: string
 *                       es_obligatoria:
 *                         type: boolean
 *                   example: [
 *                     { "id_opcion": "5d2bbda8-a671-43f6-810a-bf76b60917d7", "valor": "Alto (Muy activo)", "categoria": "Nivel de energía", "es_obligatoria": false },
 *                     { "id_opcion": "abc90ced-d287-45cb-97e1-5876ece9e491", "valor": "Bajo (Tranquilo)", "categoria": "Nivel de energía", "es_obligatoria": false },
 *                     { "id_opcion": "ff8e52ef-5772-48c7-8483-a2aa3bc2e654", "valor": "Cazador", "categoria": "Relación con gatos", "es_obligatoria": false },
 *                     { "id_opcion": "670cbce3-314d-4060-8605-0d5afca5cd4e", "valor": "Dominante", "categoria": "Relación con perros", "es_obligatoria": false },
 *                     { "id_opcion": "a0e9925c-29fe-4367-b00d-9e81768104fc", "valor": "Indiferente", "categoria": "Relación con gatos", "es_obligatoria": false },
 *                     { "id_opcion": "6a21f71e-0fb1-49ec-a5b1-ddc6904a6c02", "valor": "Medio", "categoria": "Nivel de energía", "es_obligatoria": false },
 *                     { "id_opcion": "c2221dfa-53ec-4f45-a596-ce3489a12c0b", "valor": "No recomendado", "categoria": "Convivencia con niños", "es_obligatoria": false },
 *                     { "id_opcion": "fad244a2-6de3-4cec-8ff9-f95a95ee4a05", "valor": "Prefiere estar solo", "categoria": "Relación con perros", "es_obligatoria": false },
 *                     { "id_opcion": "a003e572-4ee5-40ce-a42b-3a25839cd698", "valor": "Recomendado", "categoria": "Convivencia con niños", "es_obligatoria": false },
 *                     { "id_opcion": "c97ad9ef-9a62-4fac-935c-92a8def6e600", "valor": "Sociable", "categoria": "Relación con gatos", "es_obligatoria": false },
 *                     { "id_opcion": "8ebbfa4e-0b44-4fca-9b55-9e7191595aee", "valor": "Sociable", "categoria": "Relación con perros", "es_obligatoria": false },
 *                     { "id_opcion": "a5f4e944-3aaa-4c79-bb65-b1a634f4a5ad", "valor": "Adulto (3-7)", "categoria": "Rango de edad", "es_obligatoria": false },
 *                     { "id_opcion": "ed1461ab-e1ce-4275-a355-c68b1c5fd497", "valor": "Cachorro (0-1)", "categoria": "Rango de edad", "es_obligatoria": false },
 *                     { "id_opcion": "f6d0f7cd-aff8-479a-abf5-09610a22ddd1", "valor": "Grande", "categoria": "Tamaño", "es_obligatoria": false },
 *                     { "id_opcion": "8e4462a4-6b49-47a9-b9ab-c1625002b2df", "valor": "Joven (1-3)", "categoria": "Rango de edad", "es_obligatoria": false },
 *                     { "id_opcion": "86343ff8-228e-420f-ab02-6a0f77a07b6a", "valor": "Mediano", "categoria": "Tamaño", "es_obligatoria": false },
 *                     { "id_opcion": "aac07f90-4b3c-4a68-aa39-cb0d9d104298", "valor": "Pequeño", "categoria": "Tamaño", "es_obligatoria": false },
 *                     { "id_opcion": "26d1c2cc-b448-40d5-b462-9f0609edbbc8", "valor": "Senior (7+)", "categoria": "Rango de edad", "es_obligatoria": false },
 *                     { "id_opcion": "4f8b74cb-d3c4-4391-8e7a-0311078ca9a2", "valor": "Gato", "categoria": "Tipo de animal", "es_obligatoria": true },
 *                     { "id_opcion": "00576db2-e3b6-4517-a399-0bba8eb37473", "valor": "Hembra", "categoria": "Sexo", "es_obligatoria": false },
 *                     { "id_opcion": "6225d818-ac3b-4e4b-9399-c44fd080c19a", "valor": "Macho", "categoria": "Sexo", "es_obligatoria": false },
 *                     { "id_opcion": "c782f31c-1d2a-4332-9b09-49bf26af7e4c", "valor": "Perro", "categoria": "Tipo de animal", "es_obligatoria": true },
 *                     { "id_opcion": "1f13ca46-dffe-48b1-a29c-42a3191f2a28", "valor": "Discapacidad motriz", "categoria": "Condición Especial", "es_obligatoria": false },
 *                     { "id_opcion": "d002929d-1fb0-4d0e-8ee1-7bce21da9dbd", "valor": "En proceso", "categoria": "Esterilización", "es_obligatoria": false },
 *                     { "id_opcion": "16f24037-f305-43f3-9f11-19af2bb71e55", "valor": "Ninguna", "categoria": "Condición Especial", "es_obligatoria": false },
 *                     { "id_opcion": "f4156526-78bb-4e90-bacb-1543b33061d3", "valor": "No", "categoria": "Esterilización", "es_obligatoria": false },
 *                     { "id_opcion": "a594b4c0-8ab3-4c68-9b77-bc89dfa7097d", "valor": "Sí", "categoria": "Esterilización", "es_obligatoria": false },
 *                     { "id_opcion": "c727458d-ea13-45f9-ae0f-ba45f467403c", "valor": "Tratamiento crónico", "categoria": "Condición Especial", "es_obligatoria": false }
 *                   ]
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', listarEtiquetas);

module.exports = router;
