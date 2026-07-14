import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ExtinguisherInspectionPayload } from './validation.js';

export class LocalDatabase {
  private readonly database: DatabaseSync;

  constructor(public readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        company_name TEXT NOT NULL,
        inspection_date TEXT NOT NULL,
        technician_id TEXT,
        technician_name TEXT NOT NULL,
        received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source_device_id TEXT,
        sync_version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extinguishers (
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        numero TEXT NOT NULL,
        ubicacion TEXT NOT NULL,
        tipo_extintor TEXT NOT NULL,
        capacidad TEXT NOT NULL,
        proxima_recarga TEXT NOT NULL,
        presion TEXT NOT NULL,
        presion_comentario TEXT NOT NULL,
        altura TEXT NOT NULL,
        altura_comentario TEXT NOT NULL,
        seguro TEXT NOT NULL,
        seguro_comentario TEXT NOT NULL,
        pintura TEXT NOT NULL,
        pintura_comentario TEXT NOT NULL,
        manguera TEXT NOT NULL,
        manguera_comentario TEXT NOT NULL,
        difusor TEXT NOT NULL,
        difusor_comentario TEXT NOT NULL,
        senalamiento TEXT NOT NULL,
        senalamiento_comentario TEXT NOT NULL,
        observaciones TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        PRIMARY KEY (inspection_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_extinguishers_inspection
      ON extinguishers(inspection_id);

      CREATE TABLE IF NOT EXISTS generated_reports (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        format_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('generated', 'error')),
        error_message TEXT,
        template_version TEXT NOT NULL,
        UNIQUE (inspection_id, format_type)
      );

      CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at
      ON generated_reports(generated_at DESC);
    `);
  }

  upsertInspection(payload: ExtinguisherInspectionPayload) {
    const now = new Date().toISOString();
    const existing = this.database.prepare(
      'SELECT received_at FROM inspections WHERE id = ?'
    ).get(payload.inspectionId) as { received_at: string } | undefined;

    this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database.prepare(`
        INSERT INTO inspections (
          id, company_id, company_name, inspection_date, technician_id,
          technician_name, received_at, updated_at, source_device_id, sync_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          company_name = excluded.company_name,
          inspection_date = excluded.inspection_date,
          technician_id = excluded.technician_id,
          technician_name = excluded.technician_name,
          updated_at = excluded.updated_at,
          source_device_id = excluded.source_device_id,
          sync_version = excluded.sync_version
      `).run(
        payload.inspectionId,
        payload.company.id ?? null,
        payload.company.name,
        payload.date,
        payload.technician.id ?? null,
        payload.technician.name,
        existing?.received_at ?? now,
        now,
        payload.sourceDeviceId ?? null,
        payload.syncVersion
      );

      this.database.prepare('DELETE FROM extinguishers WHERE inspection_id = ?')
        .run(payload.inspectionId);
      const insert = this.database.prepare(`
        INSERT INTO extinguishers (
          inspection_id, id, numero, ubicacion, tipo_extintor, capacidad,
          proxima_recarga, presion, presion_comentario, altura, altura_comentario,
          seguro, seguro_comentario, pintura, pintura_comentario, manguera,
          manguera_comentario, difusor, difusor_comentario, senalamiento,
          senalamiento_comentario, observaciones, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const extinguisher of payload.extinguishers) {
        insert.run(
          payload.inspectionId,
          extinguisher.id,
          extinguisher.numero,
          extinguisher.ubicacion,
          extinguisher.tipo_extintor,
          extinguisher.capacidad,
          extinguisher.proxima_recarga,
          extinguisher.presion,
          extinguisher.presion_comentario,
          extinguisher.altura,
          extinguisher.altura_comentario,
          extinguisher.seguro,
          extinguisher.seguro_comentario,
          extinguisher.pintura,
          extinguisher.pintura_comentario,
          extinguisher.manguera,
          extinguisher.manguera_comentario,
          extinguisher.difusor,
          extinguisher.difusor_comentario,
          extinguisher.senalamiento,
          extinguisher.senalamiento_comentario,
          extinguisher.observaciones,
          extinguisher.createdAt ?? null,
          extinguisher.updatedAt ?? null
        );
      }
      this.database.exec('COMMIT;');
      return {
        created: !existing,
        inspectionId: payload.inspectionId,
        extinguishersReceived: payload.extinguishers.length,
        syncedAt: now,
      };
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  inspectionCount(id: string): number {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM inspections WHERE id = ?')
      .get(id) as { count: number };
    return row.count;
  }

  extinguisherCount(inspectionId: string): number {
    const row = this.database.prepare(
      'SELECT COUNT(*) AS count FROM extinguishers WHERE inspection_id = ?'
    ).get(inspectionId) as { count: number };
    return row.count;
  }

  saveGeneratedReport(input: {
    inspectionId: string;
    formatType: string;
    filename: string;
    filePath: string;
    generatedAt: string;
    status: 'generated' | 'error';
    errorMessage: string | null;
    templateVersion: string;
  }): GeneratedReport {
    const existing = this.getReportForInspection(input.inspectionId, input.formatType);
    const id = existing?.id ?? randomUUID();
    this.database.prepare(`
      INSERT INTO generated_reports (
        id, inspection_id, format_type, filename, file_path, generated_at,
        status, error_message, template_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(inspection_id, format_type) DO UPDATE SET
        filename = excluded.filename,
        file_path = excluded.file_path,
        generated_at = excluded.generated_at,
        status = excluded.status,
        error_message = excluded.error_message,
        template_version = excluded.template_version
    `).run(
      id,
      input.inspectionId,
      input.formatType,
      input.filename,
      input.filePath,
      input.generatedAt,
      input.status,
      input.errorMessage,
      input.templateVersion
    );
    return this.getReport(id)!;
  }

  getReport(id: string): GeneratedReport | undefined {
    return this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version,
             i.company_name, i.inspection_date
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.id = ?
    `).get(id) as GeneratedReport | undefined;
  }

  getReportForInspection(inspectionId: string, formatType: string): GeneratedReport | undefined {
    return this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version,
             i.company_name, i.inspection_date
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id
      WHERE r.inspection_id = ? AND r.format_type = ?
    `).get(inspectionId, formatType) as GeneratedReport | undefined;
  }

  getReportByFilename(filename: string): GeneratedReport | undefined {
    return this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version,
             i.company_name, i.inspection_date
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.filename = ?
    `).get(filename) as GeneratedReport | undefined;
  }

  listReports(): GeneratedReport[] {
    return this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version,
             i.company_name, i.inspection_date
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id
      ORDER BY r.generated_at DESC
    `).all() as unknown as GeneratedReport[];
  }

  reportCount(inspectionId: string): number {
    const row = this.database.prepare(
      'SELECT COUNT(*) AS count FROM generated_reports WHERE inspection_id = ?'
    ).get(inspectionId) as { count: number };
    return row.count;
  }

  summary() {
    return {
      inspections: this.database.prepare('SELECT COUNT(*) AS count FROM inspections').get(),
      extinguishers: this.database.prepare('SELECT COUNT(*) AS count FROM extinguishers').get(),
      recent: this.database.prepare(`
        SELECT id, company_name, inspection_date, updated_at, sync_version
        FROM inspections ORDER BY updated_at DESC LIMIT 20
      `).all(),
      reports: this.database.prepare(`
        SELECT id, inspection_id, format_type, filename, generated_at, status,
               error_message, template_version
        FROM generated_reports ORDER BY generated_at DESC LIMIT 20
      `).all(),
    };
  }

  close() {
    this.database.close();
  }
}

export interface GeneratedReport {
  id: string;
  inspection_id: string;
  format_type: string;
  filename: string;
  file_path: string;
  generated_at: string;
  status: 'generated' | 'error';
  error_message: string | null;
  template_version: string;
  company_name: string;
  inspection_date: string;
}
