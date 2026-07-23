import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import helmet from 'helmet';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import multer from 'multer';
import { ZodError } from 'zod';
import { AdminRepository } from './admin-repository.js';
import { createAdminRouter } from './admin-router.js';
import { SecurityConfig } from './config.js';
import { LocalDatabase } from './database.js';
import { ExtinguisherReportService } from './report-generator.js';
import { CorsOriginError, corsOriginAllowed, createSecurity } from './security.js';
import { evidenceFinalizeSchema, evidenceMetadataSchema, extinguisherInspectionSchema, hydrantInspectionSchema, inspectionSyncSchema } from './validation.js';
import { OperationalService } from './operations.js';
import { requestLogging } from './logger.js';
import { SERVER_VERSION } from './version.js';

let syncQueue: Promise<void> = Promise.resolve();
function serializeSync<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncQueue.then(operation, operation);
  syncQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function actualImage(buffer: Buffer): { mimeType: 'image/jpeg' | 'image/png'; width: number; height: number } | null {
  if (buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { mimeType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { mimeType: 'image/jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += length + 2;
  }
  return null;
}

export function createApp(
  database: LocalDatabase,
  reportService: ExtinguisherReportService,
  adminRepository: AdminRepository,
  adminWebPath: string,
  securityConfig: SecurityConfig,
  operations?: OperationalService
) {
  const app = express();
  const runWrite = <T>(operation: () => Promise<T>) =>
    operations ? operations.coordinator.runWrite(operation) : serializeSync(operation);
  const ensureReportSpace = () => operations?.ensureFreeSpace(
    reportService.reportsDirectory,
    fs.existsSync(reportService.templatePath) ? fs.statSync(reportService.templatePath).size * 2 : 0
  );
  const security = createSecurity(adminRepository, securityConfig);
  const signaturesDirectory = path.join(path.dirname(database.filePath), 'signatures');
  const evidenceDirectory = path.join(path.dirname(database.filePath), 'evidence');
  fs.mkdirSync(signaturesDirectory, { recursive: true });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 4 } })
    .fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);
  app.disable('x-powered-by');
  app.set('trust proxy', securityConfig.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", ...securityConfig.allowedAdminOrigins],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((request, _response, next) => {
    if (corsOriginAllowed(request, securityConfig.allowedAdminOrigins)) {
      next();
      return;
    }
    next(new CorsOriginError('Origin not allowed'));
  });
  app.use(cors({
    origin(origin, callback) {
      callback(null, origin || false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-ExtinCheck-CSRF'],
  }));
  // The request also contains inspection data, so transport overhead must be
  // larger than the validated 1 MiB decoded PNG signature limit.
  app.use(express.json({ limit: '2mb', strict: true }));
  if (operations) app.use(requestLogging(operations.logger));
  if (operations) {
    app.use((request, response, next) => {
      const legacyInspectionWrite = request.path === '/api/inspections/extinguishers'
        || request.path === '/api/inspections/hydrants';
      const evidenceWrite = request.path.includes('/evidence') && !request.path.endsWith('/finalize');
      if ((!legacyInspectionWrite && !evidenceWrite)
          || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        next();
        return;
      }
      void operations.coordinator.runWrite(() => new Promise<void>((resolve, reject) => {
        response.once('finish', resolve);
        response.once('close', resolve);
        try { next(); } catch (error) { reject(error); }
      })).catch(next);
    });
  }

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'ExtinCheck Local Server',
      version: SERVER_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/admin/auth', security.authRouter);

  app.get(
    '/api/admin/health',
    security.adminRateLimit,
    security.requireAdminSession,
    (_request, response) => {
      const summary = database.summary();
      const operational = operations?.status();
      response.json({
        ok: true,
        service: 'ExtinCheck Local Server',
        version: SERVER_VERSION,
        environment: securityConfig.nodeEnv,
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          schemaVersion: database.schemaVersion(),
          integrity: database.integrity().ok,
          inspections: countFromSummary(summary.inspections),
          extinguishers: countFromSummary(summary.extinguishers),
          hydrants: countFromSummary(summary.hydrants),
          reports: summary.reports.length,
        },
        operational: operational ?? null,
        timestamp: new Date().toISOString(),
      });
    }
  );

  app.use(
    '/api',
    createAdminRouter(
      adminRepository,
      security.requireAdminSession,
      security.requireAdminCsrf,
      security.adminRateLimit,
      operations?.coordinator
    )
  );

  if (operations) {
    app.get(
      '/api/admin/maintenance/status',
      security.adminRateLimit,
      security.requireAdminSession,
      (_request, response) => response.json({ ok: true, status: operations.status() })
    );
    app.get(
      '/api/admin/maintenance/backups',
      security.adminRateLimit,
      security.requireAdminSession,
      (_request, response) => response.json({ ok: true, backups: operations.listBackups() })
    );
    app.get(
      '/api/admin/maintenance/audit',
      security.adminRateLimit,
      security.requireAdminSession,
      (_request, response) => response.json({ ok: true, audit: operations.storageAudit() })
    );
    app.get(
      '/api/admin/maintenance/backups/:id/manifest',
      security.adminRateLimit,
      security.requireAdminSession,
      (request, response) => {
        try {
          response
            .attachment(`manifest-${routeParam(request.params.id)}.json`)
            .json(operations.manifest(routeParam(request.params.id)));
        } catch {
          response.status(404).json({ ok: false, message: 'Respaldo no encontrado.' });
        }
      }
    );
    app.post(
      '/api/admin/maintenance/backups',
      security.adminRateLimit,
      security.requireAdminSession,
      security.requireAdminCsrf,
      async (request, response) => {
        try {
          const backup = await operations.createBackup({
            label: typeof request.body?.label === 'string' ? request.body.label : undefined,
          });
          response.status(201).json({ ok: true, backup });
        } catch (error) {
          response.status(409).json({
            ok: false,
            message: error instanceof Error ? error.message : 'No se pudo crear el respaldo.',
          });
        }
      }
    );
  }

  app.get('/api/mobile/catalog', security.requireMobileToken, (_request, response) => {
    response.json(adminRepository.mobileCatalog());
  });

  app.post(
    '/api/inspections/extinguishers',
    security.syncRateLimit,
    security.requireMobileToken,
    async (request, response, next) => {
    try {
      const payload = extinguisherInspectionSchema.parse(request.body);
      const result = database.upsertInspection(payload);
      database.addSelectedFormatId(payload.inspectionId, 'extintores');
      try {
        ensureReportSpace();
        const report = await reportService.generate(payload.inspectionId);
        response.status(result.created ? 201 : 200).json({
          ok: true,
          ...result,
          report: {
            id: report.id,
            filename: report.filename,
            downloadUrl: mobileReportUrl(payload.inspectionId, report.id),
            generatedAt: report.generated_at,
          },
        });
      } catch (generationError) {
        logInternalError(securityConfig, 'Extinguisher report generation failed', generationError);
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
    }
  );

  app.post(
    '/api/inspections/hydrants',
    security.syncRateLimit,
    security.requireMobileToken,
    async (request, response, next) => {
    try {
      const payload = hydrantInspectionSchema.parse(request.body);
      const result = database.upsertHydrantInspection(payload);
      database.addSelectedFormatId(payload.inspectionId, 'hidrantes');
      try {
        ensureReportSpace();
        const report = await reportService.generate(payload.inspectionId);
        response.status(result.created ? 201 : 200).json({
          ok: true,
          ...result,
          report: {
            id: report.id,
            filename: report.filename,
            downloadUrl: mobileReportUrl(payload.inspectionId, report.id),
            generatedAt: report.generated_at,
          },
        });
      } catch (generationError) {
        logInternalError(securityConfig, 'Hydrant report generation failed', generationError);
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
    }
  );

  app.post(
    '/api/inspections/sync',
    security.syncRateLimit,
    security.requireMobileToken,
    async (request, response, next) => {
    let payload: ReturnType<typeof inspectionSyncSchema.parse>;
    try {
      payload = inspectionSyncSchema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        response.status(400).json({
          ok: false, message: 'Invalid inspection payload',
          issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
        return;
      }
      next(error);
      return;
    }

    try {
      const result = await runWrite(async () => {
        const supported: string[] = payload.selectedFormatIds.filter(
          (id) => id === 'extintores' || id === 'hidrantes'
        );
        const hasFirePumps = Boolean(payload.firePumps?.length);
        if (hasFirePumps) supported.push('fire_pumps');
        const hasAlarms = Boolean(payload.alarms);
        if (hasAlarms) supported.push('alarms');
        const hasAnsul = Boolean(payload.ansul);
        if (hasAnsul) supported.push('ansul_r102');
        const previousSignature = database.getInspectionSignature(payload.inspectionId);
        const newSignaturePath = payload.signature && path.join(signaturesDirectory, `${randomUUID()}.png`);
        const stagedSignaturePath = newSignaturePath && `${newSignaturePath}.pending`;
        let transactionStarted = false;
        try {
          if (payload.signature && stagedSignaturePath) {
            operations?.ensureFreeSpace(
              signaturesDirectory,
              Buffer.byteLength(payload.signature.dataBase64, 'base64')
            );
            fs.writeFileSync(stagedSignaturePath, Buffer.from(payload.signature.dataBase64, 'base64'), { flag: 'wx' });
          }
          database.beginSync();
          transactionStarted = true;
          const created = database.upsertInspectionMetadata(payload);
          if (payload.extinguishers) database.upsertInspection({ ...payload, extinguishers: payload.extinguishers }, false);
          if (payload.hydrants) database.upsertHydrantInspection({ ...payload, hydrants: payload.hydrants }, false);
          if (payload.firePumps) database.upsertFirePumpForms(payload);
          if (payload.alarms) database.upsertAlarmForms(payload);
          if (payload.ansul) database.upsertAnsulForm(payload);
          database.clearUnselectedSupportedFormats(payload.inspectionId, payload.selectedFormatIds);
          database.setSelectedFormatIds(payload.inspectionId, payload.selectedFormatIds);
          if (payload.signature !== undefined) {
            if (payload.signature && newSignaturePath && stagedSignaturePath) {
              fs.renameSync(stagedSignaturePath, newSignaturePath);
              database.upsertInspectionSignature({
                inspectionId: payload.inspectionId, signatureType: 'technician', mimeType: 'image/png',
                filePath: newSignaturePath, signerName: payload.signature.signerName,
                signedAt: payload.signature.signedAt,
              });
            } else {
              database.deleteInspectionSignature(payload.inspectionId);
            }
          }
          if (supported.length && payload.evidenceManifest === undefined) {
            ensureReportSpace();
          }
          const report = supported.length && payload.evidenceManifest === undefined
            ? await reportService.generate(payload.inspectionId, { recordFailure: false }) : null;
          database.commitSync();
          transactionStarted = false;
          const previousSignaturePath = previousSignature?.file_path
            ? database.resolvePath(previousSignature.file_path) : null;
          if (payload.signature !== undefined && previousSignaturePath
              && previousSignaturePath !== newSignaturePath
              && isInsideDirectory(previousSignaturePath, signaturesDirectory)) {
            try { fs.rmSync(previousSignaturePath, { force: true }); }
            catch (cleanupError) {
              logInternalError(securityConfig, 'Previous signature cleanup failed', cleanupError);
            }
          }
          return { created, supported, report };
        } catch (error) {
          if (transactionStarted) database.rollbackSync();
          if (stagedSignaturePath) fs.rmSync(stagedSignaturePath, { force: true });
          if (newSignaturePath && isInsideDirectory(newSignaturePath, signaturesDirectory)) {
            fs.rmSync(newSignaturePath, { force: true });
          }
          try { reportService.recordFailedAttempt(payload.inspectionId, error); } catch { /* new row was rolled back */ }
          throw error;
        }
      });
      const unsupportedFormatIds = payload.selectedFormatIds.filter((id) => {
        if (['jockey', 'electrica', 'diesel'].includes(id)) return !result.supported.includes('fire_pumps');
        if (['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)) {
          return !result.supported.includes('alarms');
        }
        return !result.supported.includes(id);
      });
      const selectedLogicalFormats = [
        ...payload.selectedFormatIds.filter((id) =>
          !['jockey', 'electrica', 'diesel', 'tablero_ad', 'dispositivos_ad',
            'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)
        ),
        ...(payload.selectedFormatIds.some((id) => ['jockey', 'electrica', 'diesel'].includes(id))
          ? ['fire_pumps'] : []),
        ...(payload.selectedFormatIds.some((id) =>
          ['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion'].includes(id)
        ) ? ['alarms'] : []),
      ];
      response.status(result.created ? 201 : 200).json({
        ok: true, created: result.created, inspectionId: payload.inspectionId,
        extinguishersReceived: payload.extinguishers?.length ?? 0,
        hydrantsReceived: payload.hydrants?.length ?? 0,
        firePumpFormsReceived: payload.firePumps?.length ?? 0,
        alarmFormsReceived: payload.alarms ? 4 : 0,
        ansulFormsReceived: payload.ansul ? 1 : 0,
        alarmDevicesReceived: payload.alarms
          ? payload.alarms.addressedDevices.items.length
            + payload.alarms.conventionalDevices.items.length
            + payload.alarms.notificationDevices.items.length
          : 0,
        syncedAt: new Date().toISOString(), syncedFormatIds: result.supported,
        unsupportedFormatIds,
        syncStatus: result.supported.length === selectedLogicalFormats.length ? 'synced' : 'partial',
        report: result.report ? {
          id: result.report.id, filename: result.report.filename,
          downloadUrl: mobileReportUrl(payload.inspectionId, result.report.id),
          generatedAt: result.report.generated_at,
        } : null,
        evidencePending: payload.evidenceManifest?.filter((item) => !database.getEvidence(item.evidenceId)).length ?? 0,
        missingEvidenceIds: payload.evidenceManifest?.filter((item) => !database.getEvidence(item.evidenceId)).map((item) => item.evidenceId) ?? [],
      });
    } catch (error) {
      logInternalError(securityConfig, 'Atomic inspection synchronization failed', error);
      response.status(500).json({ ok: false, inspectionSaved: false, message: 'Inspection synchronization failed' });
    }
    }
  );

  app.post(
    '/api/inspections/:inspectionId/evidence',
    security.evidenceRateLimit,
    security.requireMobileToken,
    evidenceUpload,
    async (request, response) => {
    try {
      const metadata = evidenceMetadataSchema.parse(JSON.parse(String(request.body.metadata ?? 'null')));
      if (metadata.evidenceId.length > 128 || request.params.inspectionId !== String(request.body.inspectionId ?? '')) {
        response.status(400).json({ ok: false, message: 'Evidence metadata does not match inspection' }); return;
      }
      const inspectionId = request.params.inspectionId;
      const reportData = database.getInspectionReportData(inspectionId);
      if (!reportData) { response.status(404).json({ ok: false, message: 'Inspection not found' }); return; }
      const evidenceFormatSelected = metadata.formatType === 'fire_pumps'
        ? ['jockey', 'electrica', 'diesel'].every((id) => reportData.inspection.selectedFormatIds.includes(id))
        : metadata.formatType === 'alarms'
          ? ['tablero_ad', 'dispositivos_ad', 'dispositivos_convencionales', 'dispositivos_notificacion']
            .every((id) => reportData.inspection.selectedFormatIds.includes(id))
        : metadata.formatType === 'ansul'
          ? reportData.inspection.selectedFormatIds.includes('ansul_r102')
        : metadata.formatType === 'legacy'
          || reportData.inspection.selectedFormatIds.includes(metadata.formatType);
      if (!evidenceFormatSelected) {
        response.status(400).json({ ok: false, message: 'Evidence format is not selected for inspection' }); return;
      }
      if (!database.evidenceItemBelongs(inspectionId, metadata.formatType, metadata.itemId)) {
        response.status(400).json({ ok: false, message: 'Evidence item does not belong to inspection' }); return;
      }
      const files = request.files as Record<string, Express.Multer.File[]> | undefined;
      const original = files?.file?.[0];
      const thumbnail = files?.thumbnail?.[0];
      if (!original) { response.status(400).json({ ok: false, message: 'Evidence file is required' }); return; }
      const image = actualImage(original.buffer);
      const thumbImage = thumbnail ? actualImage(thumbnail.buffer) : null;
      if (!image || image.mimeType !== original.mimetype || !image.width || !image.height
          || image.width > 1600 || image.height > 1600) {
        response.status(400).json({ ok: false, message: 'Invalid evidence image' }); return;
      }
      if (thumbnail && (!thumbImage || thumbnail.buffer.length > 512 * 1024
          || thumbImage.width > 240 || thumbImage.height > 240)) {
        response.status(400).json({ ok: false, message: 'Invalid evidence thumbnail' }); return;
      }
      const checksum = createHash('sha256').update(original.buffer).digest('hex');
      const existing = database.getEvidence(metadata.evidenceId);
      if (existing && existing.inspection_id !== inspectionId) {
        response.status(409).json({ ok: false, message: 'Evidence id belongs to another inspection' }); return;
      }
      const duplicate = database.getEvidenceByChecksum(inspectionId, checksum);
      if (duplicate && duplicate.id !== metadata.evidenceId) {
        response.status(409).json({ ok: false, message: 'Duplicate evidence content', evidenceId: duplicate.id }); return;
      }
      const currentEvidence = database.listInspectionEvidence(inspectionId);
      if (!existing && currentEvidence.length >= 100) {
        response.status(409).json({ ok: false, message: 'Inspection evidence limit reached' }); return;
      }
      const relatedCount = currentEvidence.filter((item) => item.id !== metadata.evidenceId
        && item.format_type === metadata.formatType
        && item.form_type === (metadata.formType ?? null)
        && item.item_id === metadata.itemId
        && (metadata.itemId !== null || item.field_key === metadata.fieldKey)).length;
      if (!existing && relatedCount >= 3) {
        response.status(409).json({ ok: false, message: 'Equipment evidence limit reached' }); return;
      }
      if (existing?.checksum === checksum) {
        const saved = database.upsertEvidence({
          ...existing, format_type: metadata.formatType, form_type: metadata.formType ?? null, item_id: metadata.itemId,
          field_key: metadata.fieldKey, caption: metadata.caption,
          location_name_snapshot: metadata.locationNameSnapshot, captured_at: metadata.capturedAt,
        });
        response.json({ ok: true, created: false, evidence: {
          id: saved.id, checksum: saved.checksum,
          fileUrl: `/api/admin/evidence/${saved.id}/file`,
          thumbnailUrl: `/api/admin/evidence/${saved.id}/thumbnail`,
        } }); return;
      }
      const inspectionFolder = createHash('sha256').update(inspectionId).digest('hex').slice(0, 32);
      const directory = path.join(evidenceDirectory, inspectionFolder);
      operations?.ensureFreeSpace(
        directory,
        original.buffer.length + (thumbnail?.buffer.length ?? 0)
      );
      fs.mkdirSync(directory, { recursive: true });
      const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
      const newFilePath = path.join(directory, `${randomUUID()}.${extension}`);
      const newThumbnailPath = thumbnail ? path.join(directory, `${randomUUID()}_thumb.${thumbImage!.mimeType === 'image/png' ? 'png' : 'jpg'}`) : null;
      const stagedFile = `${newFilePath}.pending`;
      const stagedThumbnail = newThumbnailPath && `${newThumbnailPath}.pending`;
      fs.writeFileSync(stagedFile, original.buffer, { flag: 'wx' });
      if (thumbnail && stagedThumbnail) fs.writeFileSync(stagedThumbnail, thumbnail.buffer, { flag: 'wx' });
      let transactionStarted = false;
      try {
        database.beginSync(); transactionStarted = true;
        fs.renameSync(stagedFile, newFilePath);
        if (stagedThumbnail && newThumbnailPath) fs.renameSync(stagedThumbnail, newThumbnailPath);
        const saved = database.upsertEvidence({
          id: metadata.evidenceId, inspection_id: inspectionId, format_type: metadata.formatType,
          form_type: metadata.formType ?? null,
          item_id: metadata.itemId, field_key: metadata.fieldKey, caption: metadata.caption,
          location_name_snapshot: metadata.locationNameSnapshot, mime_type: image.mimeType,
          filename: `evidence-${metadata.evidenceId}.${extension}`, file_path: newFilePath,
          thumbnail_path: newThumbnailPath, file_size: original.buffer.length,
          width: image.width, height: image.height, checksum, captured_at: metadata.capturedAt,
        });
        database.commitSync(); transactionStarted = false;
        for (const storedPath of [existing?.file_path, existing?.thumbnail_path]) {
          const oldPath = storedPath ? database.resolvePath(storedPath) : null;
          if (oldPath && oldPath !== newFilePath && oldPath !== newThumbnailPath && isInsideDirectory(oldPath, evidenceDirectory)) {
            fs.rmSync(oldPath, { force: true });
          }
        }
        response.status(existing ? 200 : 201).json({ ok: true, created: !existing, evidence: {
          id: saved.id, checksum: saved.checksum,
          fileUrl: `/api/admin/evidence/${saved.id}/file`,
          thumbnailUrl: `/api/admin/evidence/${saved.id}/thumbnail`,
        } });
      } catch (error) {
        if (transactionStarted) database.rollbackSync();
        for (const candidate of [stagedFile, stagedThumbnail, newFilePath, newThumbnailPath]) {
          if (candidate && isInsideDirectory(candidate, evidenceDirectory)) fs.rmSync(candidate, { force: true });
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        response.status(400).json({ ok: false, message: 'Invalid evidence metadata' }); return;
      }
      logInternalError(securityConfig, 'Evidence upload failed', error);
      response.status(500).json({ ok: false, message: 'Evidence upload failed' });
    }
    }
  );

  app.delete(
    '/api/inspections/:inspectionId/evidence/:evidenceId',
    security.evidenceRateLimit,
    security.requireMobileToken,
    async (request, response) => {
    const inspectionId = routeParam(request.params.inspectionId);
    const evidenceId = routeParam(request.params.evidenceId);
    const evidence = database.getEvidence(evidenceId);
    if (!evidence || evidence.inspection_id !== inspectionId) {
      response.status(404).json({ ok: false, message: 'Evidence not found' }); return;
    }
    database.beginSync();
    try { database.deleteEvidence(inspectionId, evidenceId); database.commitSync(); }
    catch (error) { database.rollbackSync(); throw error; }
    for (const storedPath of [evidence.file_path, evidence.thumbnail_path]) {
      const candidate = storedPath ? database.resolvePath(storedPath) : null;
      if (candidate && isInsideDirectory(candidate, evidenceDirectory)) fs.rmSync(candidate, { force: true });
    }
    response.json({ ok: true, deleted: true });
    }
  );

  app.post(
    '/api/inspections/:inspectionId/evidence/finalize',
    security.evidenceRateLimit,
    security.requireMobileToken,
    async (request, response) => {
    try {
      const payload = evidenceFinalizeSchema.parse(request.body);
      const inspectionId = routeParam(request.params.inspectionId);
      const actual = database.listInspectionEvidence(inspectionId).map((item) => item.id).sort();
      const expected = [...payload.evidenceIds].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        response.status(409).json({ ok: false, message: 'Evidence synchronization is incomplete', expected: expected.length, received: actual.length }); return;
      }
      ensureReportSpace();
      const report = await runWrite(() => reportService.generate(inspectionId));
      response.json({ ok: true, evidenceCount: actual.length, report: {
        id: report.id, filename: report.filename,
        downloadUrl: mobileReportUrl(inspectionId, report.id),
        generatedAt: report.generated_at,
      } });
    } catch (error) {
      if (error instanceof ZodError) { response.status(400).json({ ok: false, message: 'Invalid evidence manifest' }); return; }
      logInternalError(securityConfig, 'Evidence finalization failed', error);
      response.status(500).json({ ok: false, message: 'Evidence finalization failed' });
    }
    }
  );

  app.get(
    ['/api/admin/reports/:reportId/evidence', '/api/reports/:reportId/evidence'],
    security.adminRateLimit,
    security.requireAdminSession,
    (request, response) => {
    const reportId = routeParam(request.params.reportId);
    if (!database.getReport(reportId)) { response.status(404).json({ ok: false, message: 'Report not found' }); return; }
    response.json({ ok: true, evidence: database.listReportEvidence(reportId).map((item) => {
      const reportData = database.getInspectionReportData(item.inspection_id);
      const equipmentLabel = item.item_id ? (item.format_type === 'extintores'
        ? reportData?.extinguishers.find((record) => record.id === item.item_id)?.numero
        : item.format_type === 'hidrantes'
          ? reportData?.hydrants.find((record) => record.id === item.item_id)?.numero
          : item.format_type === 'alarms'
            ? reportData?.alarms.items.find((record) => record.id === item.item_id)?.identifier
            : null) ?? item.item_id : null;
      return {
        id: item.id, formatType: item.format_type, formType: item.form_type,
        itemId: item.item_id, equipmentLabel,
        fieldKey: item.field_key, caption: item.caption, locationNameSnapshot: item.location_name_snapshot,
        capturedAt: item.captured_at, width: item.width, height: item.height,
        fileUrl: `/api/admin/evidence/${item.id}/file`,
        thumbnailUrl: `/api/admin/evidence/${item.id}/thumbnail`,
      };
    }) });
    }
  );

  app.get(
    ['/api/admin/evidence/:id/file', '/api/evidence/:id/file'],
    security.adminRateLimit,
    security.requireAdminSession,
    (request, response) => {
    const evidence = database.getEvidence(routeParam(request.params.id));
    const target = evidence ? database.resolvePath(evidence.file_path) : null;
    if (!evidence || !target || !isInsideDirectory(target, evidenceDirectory) || !fs.existsSync(target)) {
      response.status(404).json({ ok: false, message: 'Evidence not found' }); return;
    }
    response.type(evidence.mime_type).sendFile(target);
    }
  );

  app.get(
    ['/api/admin/evidence/:id/thumbnail', '/api/evidence/:id/thumbnail'],
    security.adminRateLimit,
    security.requireAdminSession,
    (request, response) => {
    const evidence = database.getEvidence(routeParam(request.params.id));
    const storedTarget = evidence?.thumbnail_path || evidence?.file_path;
    const target = storedTarget ? database.resolvePath(storedTarget) : null;
    if (!evidence || !target || !isInsideDirectory(target, evidenceDirectory) || !fs.existsSync(target)) {
      response.status(404).json({ ok: false, message: 'Evidence not found' }); return;
    }
    response.type(evidence.mime_type).sendFile(target);
    }
  );

  app.get(
    ['/api/admin/reports', '/api/reports'],
    security.adminRateLimit,
    security.requireAdminSession,
    (_request, response) => {
    response.json({
      ok: true,
      reports: database.listReports().map((report) => ({
        id: report.id,
        inspectionId: report.inspection_id,
        formatType: report.format_type,
        filename: report.filename,
        generatedAt: report.generated_at,
        status: report.status,
        errorMessage: report.status === 'error' ? 'No fue posible generar el reporte.' : null,
        lastAttemptAt: report.last_attempt_at,
        lastAttemptStatus: report.last_attempt_status,
        lastAttemptError: report.last_attempt_status === 'error'
          ? 'No fue posible completar el último intento de generación.'
          : null,
        signatureAvailable: report.signature_available === 1,
        signatureSignerName: report.signature_signer_name,
        signatureSignedAt: report.signature_signed_at,
        evidenceCount: report.evidence_count,
        firePumpForms: report.fire_pump_forms,
        alarmForms: report.alarm_forms,
        ansulForm: report.ansul_form,
        templateVersion: report.template_version,
        companyName: report.company_name,
        inspectionDate: report.inspection_date,
        formats: report.formats,
        downloadUrl: report.status === 'generated'
          ? `/api/admin/reports/${report.id}/download`
          : null,
      })),
    });
    }
  );

  app.get(
    ['/api/admin/reports/:id/download', '/api/reports/:id/download'],
    security.downloadRateLimit,
    security.requireAdminSession,
    (request, response) => {
    const reportId = routeParam(request.params.id);
    if (!isUuid(reportId)) {
      response.status(404).json({ ok: false, message: 'Report not found' });
      return;
    }
    const download = reportService.resolveDownload(reportId);
    if (!download) {
      response.status(404).json({ ok: false, message: 'Report not found' });
      return;
    }
    response.download(download.filePath, download.report.filename);
    }
  );

  app.get(
    '/api/mobile/inspections/:inspectionId/reports/:id/download',
    security.downloadRateLimit,
    security.requireMobileToken,
    (request, response) => {
      const reportId = routeParam(request.params.id);
      const inspectionId = routeParam(request.params.inspectionId);
      if (!isUuid(reportId)) {
        response.status(404).json({ ok: false, message: 'Report not found' });
        return;
      }
      const report = database.getReport(reportId);
      if (!report || report.inspection_id !== inspectionId) {
        response.status(404).json({ ok: false, message: 'Report not found' });
        return;
      }
      const download = reportService.resolveDownload(reportId);
      if (!download) {
        response.status(404).json({ ok: false, message: 'Report not found' });
        return;
      }
      response.download(download.filePath, download.report.filename);
    }
  );

  if (fs.existsSync(adminWebPath)) {
    app.use('/admin', express.static(adminWebPath, { index: false }));
    app.get(['/admin', '/admin/{*path}'], (_request, response) => {
      response.sendFile(path.join(adminWebPath, 'index.html'));
    });
  } else {
    app.get(['/admin', '/admin/{*path}'], (_request, response) => {
      response.status(503).send('El panel administrativo aún no ha sido compilado. Ejecuta npm run build.');
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ ok: false, message: 'Route not found' });
  });

  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ ok: false, message: 'Invalid or oversized evidence upload' });
      return;
    }
    if (error instanceof CorsOriginError) {
      response.status(403).json({ ok: false, message: 'Origin not allowed.' });
      return;
    }
    if ((error as Error & { type?: string }).type === 'entity.too.large') {
      response.status(413).json({ ok: false, message: 'Inspection payload is too large' });
      return;
    }
    logInternalError(securityConfig, 'Request failed', error);
    response.status(500).json({ ok: false, message: 'Local server error' });
  });
  return app;
}

function mobileReportUrl(inspectionId: string, reportId: string) {
  return `/api/mobile/inspections/${encodeURIComponent(inspectionId)}/reports/${reportId}/download`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function countFromSummary(value: unknown) {
  if (!value || typeof value !== 'object' || !('count' in value)) return 0;
  const count = Number((value as { count: unknown }).count);
  return Number.isFinite(count) ? count : 0;
}

function logInternalError(config: SecurityConfig, context: string, error: unknown) {
  if (config.nodeEnv === 'development') {
    console.error(`[server] ${context}:`, error);
    return;
  }
  if (config.nodeEnv !== 'test') {
    const kind = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[server] ${context} (${kind})`);
  }
}
