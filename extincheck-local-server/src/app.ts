import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { AdminRepository } from './admin-repository.js';
import { createAdminRouter } from './admin-router.js';
import { LocalDatabase } from './database.js';
import { ExtinguisherReportService } from './report-generator.js';
import { extinguisherInspectionSchema, hydrantInspectionSchema } from './validation.js';

export function createApp(
  database: LocalDatabase,
  allowedOrigins: string[],
  reportService: ExtinguisherReportService,
  adminRepository: AdminRepository,
  adminWebPath: string
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isLocalNetworkOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by local CORS policy'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
  }));
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'ExtinCheck Local Server',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', createAdminRouter(adminRepository));

  app.get('/api/mobile/catalog', (_request, response) => {
    response.json(adminRepository.mobileCatalog());
  });

  app.post('/api/inspections/extinguishers', async (request, response, next) => {
    try {
      const payload = extinguisherInspectionSchema.parse(request.body);
      const result = database.upsertInspection(payload);
      try {
        const report = await reportService.generate(payload.inspectionId);
        response.status(result.created ? 201 : 200).json({
          ok: true,
          ...result,
          report: {
            id: report.id,
            filename: report.filename,
            downloadUrl: `/api/reports/${report.id}/download`,
            generatedAt: report.generated_at,
          },
        });
      } catch (generationError) {
        console.error('[server] Inspection saved, but report generation failed:', generationError);
        response.status(500).json({
          ok: false,
          inspectionSaved: true,
          inspectionId: payload.inspectionId,
          message: 'Inspection saved, but the inspection report could not be generated',
        });
      }
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

  app.post('/api/inspections/hydrants', async (request, response, next) => {
    try {
      const payload = hydrantInspectionSchema.parse(request.body);
      const result = database.upsertHydrantInspection(payload);
      try {
        const report = await reportService.generate(payload.inspectionId);
        response.status(result.created ? 201 : 200).json({
          ok: true,
          ...result,
          report: {
            id: report.id,
            filename: report.filename,
            downloadUrl: `/api/reports/${report.id}/download`,
            generatedAt: report.generated_at,
          },
        });
      } catch (generationError) {
        console.error('[server] Inspection saved, but report generation failed:', generationError);
        response.status(500).json({
          ok: false,
          inspectionSaved: true,
          inspectionId: payload.inspectionId,
          message: 'Inspection saved, but the inspection report could not be generated',
        });
      }
    } catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({
          ok: false,
          message: 'Invalid hydrant inspection payload',
          issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
        return;
      }
      next(error);
    }
  });

  app.get('/api/reports', (_request, response) => {
    response.json({
      ok: true,
      reports: database.listReports().map((report) => ({
        id: report.id,
        inspectionId: report.inspection_id,
        formatType: report.format_type,
        filename: report.filename,
        generatedAt: report.generated_at,
        status: report.status,
        errorMessage: report.error_message,
        templateVersion: report.template_version,
        companyName: report.company_name,
        inspectionDate: report.inspection_date,
        formats: report.formats,
        downloadUrl: report.status === 'generated' ? `/api/reports/${report.id}/download` : null,
      })),
    });
  });

  app.get('/api/reports/:id/download', (request, response) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.params.id)) {
      response.status(404).json({ ok: false, message: 'Report not found' });
      return;
    }
    const download = reportService.resolveDownload(request.params.id);
    if (!download) {
      response.status(404).json({ ok: false, message: 'Report not found' });
      return;
    }
    response.download(download.filePath, download.report.filename);
  });

  if (fs.existsSync(adminWebPath)) {
    app.use('/admin', express.static(adminWebPath, { index: false }));
    app.get(/^\/admin(?:\/.*)?$/, (_request, response) => {
      response.sendFile(path.join(adminWebPath, 'index.html'));
    });
  } else {
    app.get(/^\/admin(?:\/.*)?$/, (_request, response) => {
      response.status(503).send('El panel administrativo aún no ha sido compilado. Ejecuta npm run build.');
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ ok: false, message: 'Route not found' });
  });

  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error('[server] Request failed:', error);
    response.status(500).json({ ok: false, message: 'Local server error' });
  });
  return app;
}

function isLocalNetworkOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLocaleLowerCase();
    if (host === 'localhost' || host === '::1' || host === '[::1]' || host.startsWith('127.')) return true;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    const match = /^172\.(\d{1,2})\./.exec(host);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  } catch {
    return false;
  }
}
