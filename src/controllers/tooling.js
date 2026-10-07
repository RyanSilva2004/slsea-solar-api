// §10 Tooling routes
import swaggerUi from 'swagger-ui-express';
import document from '../openapi/document.js';

export function health(req, res) {
  res.json({ status: 'ok', service: 'slsea-solar-api' });
}

export function openapi(req, res) {
  res.json(document);
}

// Swagger UI loads its assets relative to /solar/v1.0/docs/
export function docsRedirect(req, res) {
  res.redirect(301, 'docs/');
}

export const docsAssets = swaggerUi.serve;

export const docsPage = swaggerUi.setup(null, {
  customSiteTitle: 'SLSEA Solar API',
  swaggerOptions: { url: '/solar/v1.0/openapi', validatorUrl: null },
});
