const swaggerJsDoc = require('swagger-jsdoc');
const SwaggerParser = require('@apidevtools/swagger-parser');
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Adopción Mascotas API',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};
const spec = swaggerJsDoc(swaggerOptions);
SwaggerParser.validate(spec).then(() => {
  console.log('¡Swagger Spec válido!');
}).catch(err => {
  console.error('ERRORES DE VALIDACIÓN:');
  console.error(err);
});
