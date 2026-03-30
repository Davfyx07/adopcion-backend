require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const authRoutes = require('./routes/authRoutes');
require('./config/db'); // Prueba conexión al iniciar

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middlewares Globales
// ============================================
app.use(helmet());
app.use(cors());
app.use(express.json());

// ============================================
// Configuración de Swagger
// ============================================
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Adopción de Mascotas - Módulo Auth / Recuperación',
            version: '1.0.0',
            description: 'API para la recuperación de contraseña (HU-AUTH-03) adaptada a la rama Registro-de-usuario.',
            contact: {
                name: 'Equipo Backend',
            },
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: 'Servidor local de desarrollo',
            },
        ],
    },
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ============================================
// Rutas
// ============================================
app.use('/auth', authRoutes);

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// Inicialización
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📄 Documentación Swagger disponible en http://localhost:${PORT}/api-docs`);
});
