import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zalo Delivery API Specification',
      version: '1.0.0',
      description: 'Zalo Delivery Backend — ExpressJS + TypeScript + Kafka + Redis',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
        },
      },
    },
  },
  apis: ['./src/modules/**/*.ts', './src/routes/*.ts'],
};

const swaggerSpec = swaggerJSDoc(options);

export const docsRouter = Router();

docsRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
docsRouter.get('/swagger.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
