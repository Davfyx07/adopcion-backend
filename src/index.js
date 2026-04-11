const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos (logos locales)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Swagger config
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        },
        info: {
            title: 'Adopción Mascotas API',
            version: '1.0.0',
            description: 'API para la plataforma de adopción de mascotas',
        },
        servers: [
            { url: `http://localhost:${PORT}` }
        ]
    },
    apis: ['./src/routes/*.js']
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rutas
const authRoutes = require('./routes/authRoutes');
const adoptanteRoutes = require('./routes/adoptanteRoutes');
const etiquetaRoutes = require('./routes/etiquetaRoutes');

const albergueRoutes = require('./routes/albergueRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/adoptante', adoptanteRoutes);
app.use('/api/etiquetas', etiquetaRoutes);
app.use('/api/albergue', albergueRoutes);

app.get('/health', (_, res) => res.json({ success: true }));

app.listen(PORT, () => console.log(`Server corriendo en http://localhost:${PORT}`));