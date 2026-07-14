import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { LocalDatabase } from './database.js';
import { extinguisherInspectionSchema } from './validation.js';

export function createApp(database: LocalDatabase, allowedOrigins: string[]) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by local CORS policy'));
    },
    methods: ['GET', 'POST'],
  }));
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'ExtinCheck Local Server',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/inspections/extinguishers', (request, response, next) => {
    try {
      const payload = extinguisherInspectionSchema.parse(request.body);
      const result = database.upsertInspection(payload);
      response.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({
          ok: false,
          message: 'Invalid extinguisher inspection payload',
          issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
        return;
      }
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ ok: false, message: 'Route not found' });
  });

  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error('[server] Request failed:', error);
    response.status(500).json({ ok: false, message: 'Local server error' });
  });
  return app;
}

