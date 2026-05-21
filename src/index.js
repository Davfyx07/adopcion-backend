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
            { url: `http://localhost:${process.env.SWAGGER_PORT || PORT}` }
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
const mascotaRoutes = require('./routes/mascotaRoutes');
const tagRoutes = require('./routes/tagRoutes');
const notificacionRoutes = require('./routes/notificacionRoutes');
const matchRoutes = require('./routes/matchRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const estadisticaRoutes = require('./routes/estadisticaRoutes');
const configuracionRoutes = require('./routes/configuracionRoutes');
const recomendacionRoutes = require('./routes/recomendacionRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/adoptante', adoptanteRoutes);
app.use('/api/etiquetas', etiquetaRoutes);
app.use('/api/albergue', albergueRoutes);
app.use('/api/mascotas', mascotaRoutes);
app.use('/api', tagRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/match', matchRoutes);
app.use('/api', usuarioRoutes);
app.use('/api', estadisticaRoutes);
app.use('/api', configuracionRoutes);
app.use('/api/recomendaciones', recomendacionRoutes);

app.get('/health', (_, res) => res.json({ success: true }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server corriendo en http://localhost:${PORT}`);
    
    // DEBUG: Verificar qué está leyendo NodeJS exactamente como DATABASE_URL
    try {
      const dbUrl = process.env.DATABASE_URL || '';
      console.log('DEBUG DATABASE_URL length:', dbUrl.length);
      console.log('DEBUG DATABASE_URL starts with:', dbUrl.substring(0, 11));
      
      const { URL } = require('url');
      const parsed = new URL(dbUrl);
      console.log('DEBUG DB HOST A CONECTAR:', parsed.hostname);
    } catch (err) {
      console.log('DEBUG DB URL NO SE PUDO PARSEAR:', err.message);
    }
});
