const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const http = require('http');
const { initSocket } = require('./socket/socketManager');
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

const recomendacionRoutes = require('./routes/recomendacionRoutes');

const matchRoutes = require('./routes/matchRoutes');
const adopcionRoutes = require('./routes/adopcionRoutes');
const albergueMatchRoutes = require('./routes/albergueMatchRoutes');
const adopcionHistorialRoutes = require('./routes/adopcionHistorialRoutes');
const adminStatsRoutes = require('./routes/adminStatsRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminConfigRoutes = require('./routes/adminConfigRoutes');
const adminMascotaRoutes = require('./routes/adminMascotaRoutes');
const { iniciarJobLimpieza } = require('./jobs/notificacionCleanupJob');


app.use('/api/auth', authRoutes);
app.use('/api/adoptante', adoptanteRoutes);
app.use('/api/etiquetas', etiquetaRoutes);
app.use('/api/albergue', albergueRoutes);
app.use('/api/mascotas', mascotaRoutes);
app.use('/api', tagRoutes);
app.use('/api/notificaciones', notificacionRoutes);

app.use('/api/recomendaciones', recomendacionRoutes);
app.use('/api', matchRoutes);
app.use('/api/adopciones', adopcionRoutes);
app.use('/api/shelters/matches', albergueMatchRoutes);
app.use('/api/albergue/adopciones', adopcionHistorialRoutes);
app.use('/api', adminStatsRoutes);
app.use('/api', adminUserRoutes);
app.use('/api', adminConfigRoutes);
app.use('/api', adminMascotaRoutes);

app.get('/health', (_, res) => res.json({ success: true }));

// Iniciar jobs programados
iniciarJobLimpieza();

const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, () => console.log(`Server corriendo en http://localhost:${PORT}`));
