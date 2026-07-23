import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  ExtinguisherInspectionPayload,
  HydrantInspectionPayload,
  InspectionSyncPayload,
} from './validation.js';
import { FIRE_PUMP_CONFIG, FIRE_PUMP_MOBILE_IDS } from './fire-pump-config.js';

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
        branch_id TEXT,
        branch_name TEXT,
        attention TEXT NOT NULL DEFAULT '',
        area TEXT NOT NULL DEFAULT '',
        inspection_date TEXT NOT NULL,
        technician_id TEXT,
        technician_name TEXT NOT NULL,
        received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source_device_id TEXT,
        sync_version INTEGER NOT NULL,
        selected_format_ids TEXT NOT NULL DEFAULT '[]'
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

      CREATE TABLE IF NOT EXISTS hydrants (
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        numero TEXT NOT NULL,
        location_id TEXT,
        location_name_snapshot TEXT NOT NULL,
        custom_location INTEGER NOT NULL CHECK (custom_location IN (0, 1)),
        gabinete TEXT NOT NULL,
        gabinete_comentario TEXT NOT NULL,
        senalamiento TEXT NOT NULL,
        senalamiento_comentario TEXT NOT NULL,
        calcomania TEXT NOT NULL,
        calcomania_comentario TEXT NOT NULL,
        valvula_angular TEXT NOT NULL,
        valvula_angular_comentario TEXT NOT NULL,
        manguera TEXT NOT NULL,
        manguera_comentario TEXT NOT NULL,
        chiflon TEXT NOT NULL,
        chiflon_comentario TEXT NOT NULL,
        llave_acople TEXT NOT NULL,
        llave_acople_comentario TEXT NOT NULL,
        observaciones TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        PRIMARY KEY (inspection_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_hydrants_inspection
      ON hydrants(inspection_id);

      CREATE TABLE IF NOT EXISTS inspection_forms (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        form_type TEXT NOT NULL CHECK (form_type IN ('pump_jockey', 'pump_electric', 'pump_diesel')),
        status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'complete', 'not_applicable')),
        observations TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (inspection_id, form_type)
      );

      CREATE INDEX IF NOT EXISTS idx_inspection_forms_inspection
      ON inspection_forms(inspection_id);

      CREATE TABLE IF NOT EXISTS inspection_answers (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL REFERENCES inspection_forms(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        answer TEXT CHECK (answer IS NULL OR answer IN ('si', 'no', 'na')),
        parameter_value TEXT,
        reading_value,
        comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (form_id, question_id)
      );

      CREATE INDEX IF NOT EXISTS idx_inspection_answers_form
      ON inspection_answers(form_id);

      CREATE TABLE IF NOT EXISTS inspection_signatures (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        signature_type TEXT NOT NULL,
        mime_type TEXT NOT NULL CHECK (mime_type = 'image/png'),
        file_path TEXT NOT NULL,
        signer_name TEXT NOT NULL,
        signed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (inspection_id, signature_type)
      );

      CREATE INDEX IF NOT EXISTS idx_inspection_signatures_inspection
      ON inspection_signatures(inspection_id);

      CREATE TABLE IF NOT EXISTS inspection_evidence (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        format_type TEXT NOT NULL,
        form_type TEXT,
        item_id TEXT,
        field_key TEXT NOT NULL,
        caption TEXT,
        location_name_snapshot TEXT,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        thumbnail_path TEXT,
        file_size INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_inspection_evidence_inspection
      ON inspection_evidence(inspection_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_inspection_evidence_checksum
      ON inspection_evidence(inspection_id, checksum);

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
        last_attempt_at TEXT,
        last_attempt_status TEXT,
        last_attempt_error TEXT,
        UNIQUE (inspection_id, format_type)
      );

      CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at
      ON generated_reports(generated_at DESC);
    `);
    this.ensureColumn('inspections', 'branch_id', 'TEXT');
    this.ensureColumn('inspections', 'branch_name', 'TEXT');
    this.ensureColumn('inspections', 'attention', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('inspections', 'area', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('inspections', 'selected_format_ids', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('generated_reports', 'last_attempt_at', 'TEXT');
    this.ensureColumn('generated_reports', 'last_attempt_status', 'TEXT');
    this.ensureColumn('generated_reports', 'last_attempt_error', 'TEXT');
    this.ensureColumn('inspection_evidence', 'form_type', 'TEXT');
    this.database.exec(`UPDATE inspection_evidence SET
      form_type = CASE
        WHEN format_type = 'jockey' THEN 'pump_jockey'
        WHEN format_type = 'electrica' THEN 'pump_electric'
        WHEN format_type = 'diesel' THEN 'pump_diesel'
        ELSE form_type
      END,
      format_type = CASE
        WHEN format_type IN ('jockey', 'electrica', 'diesel') THEN 'fire_pumps'
        ELSE format_type
      END
      WHERE format_type IN ('jockey', 'electrica', 'diesel');`);
    this.database.exec(`
      UPDATE inspections SET selected_format_ids = json_array(
        CASE WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = inspections.id) THEN 'extintores' END,
        CASE WHEN EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = inspections.id) THEN 'hidrantes' END
      ) WHERE selected_format_ids = '[]';
      UPDATE inspections SET selected_format_ids = replace(replace(selected_format_ids, ',null', ''), 'null,', '')
      WHERE selected_format_ids LIKE '%null%';
      UPDATE inspections SET selected_format_ids = '[]' WHERE selected_format_ids = '[null]';
    `);
    // From Fase 6 onward a report represents the whole inspection, not one
    // format. Existing Extintores-only reports keep their id and file.
    this.database.exec(`
      DELETE FROM generated_reports
      WHERE format_type = 'extinguishers'
        AND EXISTS (
          SELECT 1 FROM generated_reports newer
          WHERE newer.inspection_id = generated_reports.inspection_id
            AND newer.format_type = 'inspection'
        );
      UPDATE generated_reports SET format_type = 'inspection'
      WHERE format_type = 'extinguishers';
    `);
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  beginSync() { this.database.exec('BEGIN IMMEDIATE;'); }
  commitSync() { this.database.exec('COMMIT;'); }
  rollbackSync() { this.database.exec('ROLLBACK;'); }
  setSelectedFormatIds(inspectionId: string, ids: string[]) {
    this.database.prepare('UPDATE inspections SET selected_format_ids = ? WHERE id = ?')
      .run(JSON.stringify(ids), inspectionId);
  }
  addSelectedFormatId(inspectionId: string, formatId: string) {
    const row = this.database.prepare('SELECT selected_format_ids AS ids FROM inspections WHERE id = ?')
      .get(inspectionId) as { ids: string } | undefined;
    const ids = row ? JSON.parse(row.ids || '[]') as string[] : [];
    this.setSelectedFormatIds(inspectionId, [...new Set([...ids, formatId])]);
  }
  clearUnselectedSupportedFormats(inspectionId: string, selectedIds: string[]) {
    if (!selectedIds.includes('extintores')) {
      this.database.prepare('DELETE FROM extinguishers WHERE inspection_id = ?').run(inspectionId);
    }
    if (!selectedIds.includes('hidrantes')) {
      this.database.prepare('DELETE FROM hydrants WHERE inspection_id = ?').run(inspectionId);
    }
    if (!FIRE_PUMP_MOBILE_IDS.some((id) => selectedIds.includes(id))) {
      this.database.prepare('DELETE FROM inspection_forms WHERE inspection_id = ?').run(inspectionId);
    }
  }

  upsertFirePumpForms(payload: InspectionSyncPayload) {
    if (!payload.firePumps) return;
    const now = new Date().toISOString();
    const getExisting = this.database.prepare(
      'SELECT id, created_at AS createdAt FROM inspection_forms WHERE inspection_id = ? AND form_type = ?'
    );
    const upsertForm = this.database.prepare(`
      INSERT INTO inspection_forms (
        id, inspection_id, form_type, status, observations, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(inspection_id, form_type) DO UPDATE SET
        status = excluded.status,
        observations = excluded.observations,
        updated_at = excluded.updated_at
    `);
    const deleteAnswers = this.database.prepare('DELETE FROM inspection_answers WHERE form_id = ?');
    const insertAnswer = this.database.prepare(`
      INSERT INTO inspection_answers (
        id, form_id, question_id, answer, parameter_value, reading_value,
        comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const form of payload.firePumps) {
      const existing = getExisting.get(payload.inspectionId, form.formType) as
        { id: string; createdAt: string } | undefined;
      const formId = existing?.id ?? randomUUID();
      const updatedAt = form.updatedAt ? new Date(form.updatedAt).toISOString() : now;
      upsertForm.run(
        formId,
        payload.inspectionId,
        form.formType,
        form.status,
        form.observations,
        existing?.createdAt ?? now,
        updatedAt
      );
      deleteAnswers.run(formId);
      for (const answer of form.answers) {
        const fixedParameter = FIRE_PUMP_CONFIG[form.formType]
          .questions[answer.questionId]?.fixedParameter;
        insertAnswer.run(
          randomUUID(),
          formId,
          answer.questionId,
          answer.answer ?? null,
          fixedParameter ?? answer.parameter ?? null,
          answer.reading ?? null,
          answer.comment ?? null,
          now,
          updatedAt
        );
      }
    }
  }
  getInspectionSignature(inspectionId: string, signatureType = 'technician'): InspectionSignature | undefined {
    return this.database.prepare(`SELECT id, inspection_id, signature_type, mime_type, file_path,
      signer_name, signed_at, created_at, updated_at FROM inspection_signatures
      WHERE inspection_id = ? AND signature_type = ?`).get(inspectionId, signatureType) as InspectionSignature | undefined;
  }
  upsertInspectionSignature(input: {
    inspectionId: string; signatureType: string; mimeType: 'image/png'; filePath: string;
    signerName: string; signedAt: string;
  }): InspectionSignature {
    const now = new Date().toISOString();
    const existing = this.getInspectionSignature(input.inspectionId, input.signatureType);
    const id = existing?.id ?? randomUUID();
    this.database.prepare(`INSERT INTO inspection_signatures (
      id, inspection_id, signature_type, mime_type, file_path, signer_name,
      signed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(inspection_id, signature_type) DO UPDATE SET
      mime_type=excluded.mime_type, file_path=excluded.file_path, signer_name=excluded.signer_name,
      signed_at=excluded.signed_at, updated_at=excluded.updated_at`).run(
      id, input.inspectionId, input.signatureType, input.mimeType, input.filePath,
      input.signerName, input.signedAt, existing?.created_at ?? now, now
    );
    return this.getInspectionSignature(input.inspectionId, input.signatureType)!;
  }
  deleteInspectionSignature(inspectionId: string, signatureType = 'technician') {
    this.database.prepare('DELETE FROM inspection_signatures WHERE inspection_id = ? AND signature_type = ?')
      .run(inspectionId, signatureType);
  }
  inspectionExists(inspectionId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM inspections WHERE id = ?').get(inspectionId));
  }
  evidenceItemBelongs(inspectionId: string, formatType: string, itemId: string | null): boolean {
    if (!itemId) return true;
    if (formatType === 'extintores') {
      return Boolean(this.database.prepare('SELECT 1 FROM extinguishers WHERE inspection_id = ? AND id = ?')
        .get(inspectionId, itemId));
    }
    if (formatType === 'hidrantes') {
      return Boolean(this.database.prepare('SELECT 1 FROM hydrants WHERE inspection_id = ? AND id = ?')
        .get(inspectionId, itemId));
    }
    return false;
  }
  getEvidence(id: string): InspectionEvidence | undefined {
    return this.database.prepare(`SELECT id, inspection_id, format_type, form_type, item_id, field_key, caption,
      location_name_snapshot, mime_type, filename, file_path, thumbnail_path, file_size,
      width, height, checksum, captured_at, created_at, updated_at
      FROM inspection_evidence WHERE id = ?`).get(id) as InspectionEvidence | undefined;
  }
  getEvidenceByChecksum(inspectionId: string, checksum: string): InspectionEvidence | undefined {
    return this.database.prepare('SELECT * FROM inspection_evidence WHERE inspection_id = ? AND checksum = ?')
      .get(inspectionId, checksum) as InspectionEvidence | undefined;
  }
  listInspectionEvidence(inspectionId: string): InspectionEvidence[] {
    return this.database.prepare(`SELECT * FROM inspection_evidence WHERE inspection_id = ?
      ORDER BY captured_at, id`).all(inspectionId) as unknown as InspectionEvidence[];
  }
  listReportEvidence(reportId: string): InspectionEvidence[] {
    return this.database.prepare(`SELECT e.* FROM inspection_evidence e
      JOIN generated_reports r ON r.inspection_id = e.inspection_id
      WHERE r.id = ? ORDER BY e.captured_at, e.id`).all(reportId) as unknown as InspectionEvidence[];
  }
  upsertEvidence(input: Omit<InspectionEvidence, 'created_at' | 'updated_at'>): InspectionEvidence {
    const now = new Date().toISOString();
    const existing = this.getEvidence(input.id);
    this.database.prepare(`INSERT INTO inspection_evidence (
      id, inspection_id, format_type, form_type, item_id, field_key, caption, location_name_snapshot,
      mime_type, filename, file_path, thumbnail_path, file_size, width, height, checksum,
      captured_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET format_type=excluded.format_type, form_type=excluded.form_type, item_id=excluded.item_id,
      field_key=excluded.field_key, caption=excluded.caption,
      location_name_snapshot=excluded.location_name_snapshot, mime_type=excluded.mime_type,
      filename=excluded.filename, file_path=excluded.file_path,
      thumbnail_path=excluded.thumbnail_path, file_size=excluded.file_size,
      width=excluded.width, height=excluded.height, checksum=excluded.checksum,
      captured_at=excluded.captured_at, updated_at=excluded.updated_at`).run(
      input.id, input.inspection_id, input.format_type, input.form_type, input.item_id, input.field_key,
      input.caption, input.location_name_snapshot, input.mime_type, input.filename,
      input.file_path, input.thumbnail_path, input.file_size, input.width, input.height,
      input.checksum, input.captured_at, existing?.created_at ?? now, now
    );
    return this.getEvidence(input.id)!;
  }
  deleteEvidence(inspectionId: string, evidenceId: string): InspectionEvidence | undefined {
    const evidence = this.getEvidence(evidenceId);
    if (!evidence || evidence.inspection_id !== inspectionId) return undefined;
    this.database.prepare('DELETE FROM inspection_evidence WHERE id = ? AND inspection_id = ?')
      .run(evidenceId, inspectionId);
    return evidence;
  }
  upsertInspectionMetadata(payload: InspectionSyncPayload): boolean {
    const now = new Date().toISOString();
    const existing = this.database.prepare('SELECT received_at FROM inspections WHERE id = ?')
      .get(payload.inspectionId) as { received_at: string } | undefined;
    this.database.prepare(`
      INSERT INTO inspections (
        id, company_id, company_name, branch_id, branch_name, attention, area, inspection_date, technician_id,
        technician_name, received_at, updated_at, source_device_id, sync_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id, company_name=excluded.company_name,
        branch_id=excluded.branch_id, branch_name=excluded.branch_name,
        attention=excluded.attention, area=excluded.area,
        inspection_date=excluded.inspection_date, technician_id=excluded.technician_id,
        technician_name=excluded.technician_name, updated_at=excluded.updated_at,
        source_device_id=excluded.source_device_id, sync_version=excluded.sync_version
    `).run(payload.inspectionId, payload.company.id ?? null, payload.company.name,
      payload.branch?.id ?? null, payload.branch?.name ?? null,
      payload.attention, payload.area, payload.date,
      payload.technician.id ?? null, payload.technician.name, existing?.received_at ?? now,
      now, payload.sourceDeviceId ?? null, payload.syncVersion);
    return !existing;
  }

  upsertInspection(payload: ExtinguisherInspectionPayload, manageTransaction = true) {
    const now = new Date().toISOString();
    const existing = this.database.prepare(
      'SELECT received_at FROM inspections WHERE id = ?'
    ).get(payload.inspectionId) as { received_at: string } | undefined;

    if (manageTransaction) this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database.prepare(`
        INSERT INTO inspections (
          id, company_id, company_name, branch_id, branch_name, inspection_date, technician_id,
          technician_name, received_at, updated_at, source_device_id, sync_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          company_name = excluded.company_name,
          branch_id = excluded.branch_id,
          branch_name = excluded.branch_name,
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
        payload.branch?.id ?? null,
        payload.branch?.name ?? null,
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
      if (manageTransaction) this.database.exec('COMMIT;');
      return {
        created: !existing,
        inspectionId: payload.inspectionId,
        extinguishersReceived: payload.extinguishers.length,
        syncedAt: now,
      };
    } catch (error) {
      if (manageTransaction) this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  upsertHydrantInspection(payload: HydrantInspectionPayload, manageTransaction = true) {
    const now = new Date().toISOString();
    const existing = this.database.prepare(
      'SELECT received_at FROM inspections WHERE id = ?'
    ).get(payload.inspectionId) as { received_at: string } | undefined;

    if (manageTransaction) this.database.exec('BEGIN IMMEDIATE;');
    try {
      this.database.prepare(`
        INSERT INTO inspections (
          id, company_id, company_name, branch_id, branch_name, inspection_date, technician_id,
          technician_name, received_at, updated_at, source_device_id, sync_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          company_name = excluded.company_name,
          branch_id = excluded.branch_id,
          branch_name = excluded.branch_name,
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
        payload.branch?.id ?? null,
        payload.branch?.name ?? null,
        payload.date,
        payload.technician.id ?? null,
        payload.technician.name,
        existing?.received_at ?? now,
        now,
        payload.sourceDeviceId ?? null,
        payload.syncVersion
      );

      this.database.prepare('DELETE FROM hydrants WHERE inspection_id = ?').run(payload.inspectionId);
      const insert = this.database.prepare(`
        INSERT INTO hydrants (
          inspection_id, id, numero, location_id, location_name_snapshot, custom_location,
          gabinete, gabinete_comentario, senalamiento, senalamiento_comentario,
          calcomania, calcomania_comentario, valvula_angular, valvula_angular_comentario,
          manguera, manguera_comentario, chiflon, chiflon_comentario,
          llave_acople, llave_acople_comentario, observaciones, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const hydrant of payload.hydrants) {
        insert.run(
          payload.inspectionId,
          hydrant.id,
          hydrant.numero,
          hydrant.locationId ?? null,
          hydrant.locationNameSnapshot,
          hydrant.customLocation ? 1 : 0,
          hydrant.gabinete,
          hydrant.gabinete_comentario,
          hydrant.senalamiento,
          hydrant.senalamiento_comentario,
          hydrant.calcomania,
          hydrant.calcomania_comentario,
          hydrant.valvula_angular,
          hydrant.valvula_angular_comentario,
          hydrant.manguera,
          hydrant.manguera_comentario,
          hydrant.chiflon,
          hydrant.chiflon_comentario,
          hydrant.llave_acople,
          hydrant.llave_acople_comentario,
          hydrant.observaciones,
          hydrant.createdAt ?? null,
          hydrant.updatedAt ?? null
        );
      }
      if (manageTransaction) this.database.exec('COMMIT;');
      return {
        created: !existing,
        inspectionId: payload.inspectionId,
        hydrantsReceived: payload.hydrants.length,
        syncedAt: now,
      };
    } catch (error) {
      if (manageTransaction) this.database.exec('ROLLBACK;');
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

  hydrantCount(inspectionId: string): number {
    const row = this.database.prepare(
      'SELECT COUNT(*) AS count FROM hydrants WHERE inspection_id = ?'
    ).get(inspectionId) as { count: number };
    return row.count;
  }
  signatureCount(inspectionId: string): number {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM inspection_signatures WHERE inspection_id = ?')
      .get(inspectionId) as { count: number };
    return row.count;
  }

  getInspectionReportData(inspectionId: string): InspectionReportData | undefined {
    const inspection = this.database.prepare(`
      SELECT id, company_id AS companyId, company_name AS companyName,
             branch_id AS branchId, branch_name AS branchName,
             attention, area,
             inspection_date AS inspectionDate, technician_id AS technicianId,
             technician_name AS technicianName, selected_format_ids AS selectedFormatIdsJson
      FROM inspections WHERE id = ?
    `).get(inspectionId) as InspectionReportData['inspection'] | undefined;
    if (!inspection) return undefined;

    const extinguishers = this.database.prepare(`
      SELECT id, numero, ubicacion, tipo_extintor, capacidad, proxima_recarga,
             presion, presion_comentario, altura, altura_comentario,
             seguro, seguro_comentario, pintura, pintura_comentario,
             manguera, manguera_comentario, difusor, difusor_comentario,
             senalamiento, senalamiento_comentario, observaciones,
             created_at AS createdAt, updated_at AS updatedAt
      FROM extinguishers WHERE inspection_id = ? ORDER BY rowid
    `).all(inspectionId) as unknown as InspectionReportData['extinguishers'];
    const rawHydrants = this.database.prepare(`
      SELECT id, numero, location_id AS locationId,
             location_name_snapshot AS locationNameSnapshot,
             custom_location AS customLocation,
             gabinete, gabinete_comentario, senalamiento, senalamiento_comentario,
             calcomania, calcomania_comentario, valvula_angular, valvula_angular_comentario,
             manguera, manguera_comentario, chiflon, chiflon_comentario,
             llave_acople, llave_acople_comentario, observaciones,
             created_at AS createdAt, updated_at AS updatedAt
      FROM hydrants WHERE inspection_id = ? ORDER BY rowid
    `).all(inspectionId) as Array<Omit<HydrantInspectionPayload['hydrants'][number], 'customLocation'> & { customLocation: number }>;
    const hydrants = rawHydrants.map((item) => ({ ...item, customLocation: item.customLocation === 1 }));
    const firePumpForms = this.database.prepare(`
      SELECT id, form_type AS formType, status, observations,
             created_at AS createdAt, updated_at AS updatedAt
      FROM inspection_forms WHERE inspection_id = ? ORDER BY form_type
    `).all(inspectionId) as unknown as InspectionReportData['firePumps'];
    const answerQuery = this.database.prepare(`
      SELECT question_id AS questionId, answer, parameter_value AS parameter,
             reading_value AS reading, comment, created_at AS createdAt,
             updated_at AS updatedAt
      FROM inspection_answers WHERE form_id = ? ORDER BY rowid
    `);
    firePumpForms.forEach((form) => {
      form.answers = answerQuery.all(form.id) as InspectionReportData['firePumps'][number]['answers'];
    });
    inspection.selectedFormatIds = JSON.parse(inspection.selectedFormatIdsJson || '[]') as string[];
    const signature = this.getInspectionSignature(inspectionId);
    const evidence = this.listInspectionEvidence(inspectionId);
    return { inspection, extinguishers, hydrants, firePumps: firePumpForms, signature, evidence };
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
        status, error_message, template_version, last_attempt_at, last_attempt_status, last_attempt_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(inspection_id, format_type) DO UPDATE SET
        filename = excluded.filename,
        file_path = excluded.file_path,
        generated_at = excluded.generated_at,
        status = excluded.status,
        error_message = excluded.error_message,
        template_version = excluded.template_version,
        last_attempt_at = excluded.last_attempt_at,
        last_attempt_status = excluded.last_attempt_status,
        last_attempt_error = excluded.last_attempt_error
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
      , input.generatedAt, input.status, input.errorMessage
    );
    return this.getReport(id)!;
  }

  saveReportAttemptFailure(inspectionId: string, formatType: string, message: string, attemptedAt: string) {
    const existing = this.getReportForInspection(inspectionId, formatType);
    if (existing?.status === 'generated') {
      this.database.prepare(`UPDATE generated_reports
        SET last_attempt_at = ?, last_attempt_status = 'error', last_attempt_error = ?
        WHERE id = ?`).run(attemptedAt, message, existing.id);
      return;
    }
    this.saveGeneratedReport({
      inspectionId, formatType, filename: existing?.filename ?? '', filePath: existing?.file_path ?? '',
      generatedAt: attemptedAt, status: 'error', errorMessage: message,
      templateVersion: existing?.template_version ?? 'unknown',
    });
  }

  private decorateReport(report: GeneratedReport): GeneratedReport {
    const labels: Record<string, string> = {
      jockey: 'Bomba Jockey', diesel: 'Bomba Diésel', electrica: 'Bomba Eléctrica',
      tablero_ad: 'Tablero A&D', dispositivos_ad: 'Dispositivos A&D',
      dispositivos_convencionales: 'Dispositivos convencionales',
      dispositivos_notificacion: 'Dispositivos de notificación', hidrantes: 'Hidrantes',
      extintores: 'Extintores', ansul_r102: 'Ansul R-102',
    };
    let ids: string[] = [];
    try { ids = JSON.parse(report.selected_format_ids || '[]') as string[]; } catch { /* legacy row */ }
    const signature = this.getInspectionSignature(report.inspection_id);
    const evidenceCount = this.listInspectionEvidence(report.inspection_id).length;
    const pumpForms = this.database.prepare(`
      SELECT f.form_type AS formType, f.status, f.updated_at AS updatedAt,
             COUNT(CASE WHEN a.answer IS NOT NULL THEN 1 END) AS answered
      FROM inspection_forms f
      LEFT JOIN inspection_answers a ON a.form_id = f.id
      WHERE f.inspection_id = ?
      GROUP BY f.id ORDER BY f.form_type
    `).all(report.inspection_id) as Array<{
      formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
      status: string;
      updatedAt: string;
      answered: number;
    }>;
    const rawFormats = ids.filter((id) => !['jockey', 'diesel', 'electrica'].includes(id))
      .map((id) => labels[id] ?? id);
    if (ids.some((id) => ['jockey', 'diesel', 'electrica'].includes(id))) {
      rawFormats.push('Bombas');
    }
    return {
      ...report,
      formats: rawFormats.join(', ') || report.formats,
      signature_available: signature ? 1 : 0,
      signature_signer_name: signature?.signer_name ?? null,
      signature_signed_at: signature?.signed_at ?? null,
      evidence_count: evidenceCount,
      fire_pump_forms: pumpForms.map((form) => ({
        ...form,
        total: Object.keys(FIRE_PUMP_CONFIG[form.formType].questions).length,
      })),
    };
  }

  getReport(id: string): GeneratedReport | undefined {
    const report = this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version, r.last_attempt_at,
             r.last_attempt_status, r.last_attempt_error,
             i.company_name, i.inspection_date, i.selected_format_ids,
             CASE
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                AND EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Extintores, Hidrantes'
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                 THEN 'Extintores'
               WHEN EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Hidrantes'
               ELSE ''
             END AS formats
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.id = ?
    `).get(id) as GeneratedReport | undefined;
    return report ? this.decorateReport(report) : undefined;
  }

  getReportForInspection(inspectionId: string, formatType: string): GeneratedReport | undefined {
    const report = this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version, r.last_attempt_at,
             r.last_attempt_status, r.last_attempt_error,
             i.company_name, i.inspection_date, i.selected_format_ids,
             CASE
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                AND EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Extintores, Hidrantes'
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                 THEN 'Extintores'
               WHEN EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Hidrantes'
               ELSE ''
             END AS formats
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id
      WHERE r.inspection_id = ? AND r.format_type = ?
    `).get(inspectionId, formatType) as GeneratedReport | undefined;
    return report ? this.decorateReport(report) : undefined;
  }

  getReportByFilename(filename: string): GeneratedReport | undefined {
    const report = this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version, r.last_attempt_at,
             r.last_attempt_status, r.last_attempt_error,
             i.company_name, i.inspection_date, i.selected_format_ids,
             CASE
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                AND EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Extintores, Hidrantes'
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                 THEN 'Extintores'
               WHEN EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Hidrantes'
               ELSE ''
             END AS formats
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.filename = ?
    `).get(filename) as GeneratedReport | undefined;
    return report ? this.decorateReport(report) : undefined;
  }

  listReports(): GeneratedReport[] {
    const reports = this.database.prepare(`
      SELECT r.id, r.inspection_id, r.format_type, r.filename, r.file_path, r.generated_at,
             r.status, r.error_message, r.template_version, r.last_attempt_at,
             r.last_attempt_status, r.last_attempt_error,
             i.company_name, i.inspection_date, i.selected_format_ids,
             CASE
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                AND EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Extintores, Hidrantes'
               WHEN EXISTS (SELECT 1 FROM extinguishers e WHERE e.inspection_id = r.inspection_id)
                 THEN 'Extintores'
               WHEN EXISTS (SELECT 1 FROM hydrants h WHERE h.inspection_id = r.inspection_id)
                 THEN 'Hidrantes'
               ELSE ''
             END AS formats
      FROM generated_reports r JOIN inspections i ON i.id = r.inspection_id
      ORDER BY r.generated_at DESC
    `).all() as unknown as GeneratedReport[];
    return reports.map((report) => this.decorateReport(report));
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
      hydrants: this.database.prepare('SELECT COUNT(*) AS count FROM hydrants').get(),
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
  formats: string;
  selected_format_ids: string;
  last_attempt_at: string | null;
  last_attempt_status: 'generated' | 'error' | null;
  last_attempt_error: string | null;
  signature_available: number;
  signature_signer_name: string | null;
  signature_signed_at: string | null;
  evidence_count: number;
  fire_pump_forms: Array<{
    formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
    status: string;
    updatedAt: string;
    answered: number;
    total: number;
  }>;
}

export interface InspectionSignature {
  id: string;
  inspection_id: string;
  signature_type: string;
  mime_type: 'image/png';
  file_path: string;
  signer_name: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
}

export interface InspectionEvidence {
  id: string;
  inspection_id: string;
  format_type: string;
  form_type: string | null;
  item_id: string | null;
  field_key: string;
  caption: string | null;
  location_name_snapshot: string | null;
  mime_type: 'image/jpeg' | 'image/png';
  filename: string;
  file_path: string;
  thumbnail_path: string | null;
  file_size: number;
  width: number;
  height: number;
  checksum: string;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

export interface InspectionReportData {
  inspection: {
    id: string;
    companyId: string | null;
    companyName: string;
    branchId: string | null;
    branchName: string | null;
    attention: string;
    area: string;
    inspectionDate: string;
    technicianId: string | null;
    technicianName: string;
    selectedFormatIdsJson: string;
    selectedFormatIds: string[];
  };
  extinguishers: ExtinguisherInspectionPayload['extinguishers'];
  hydrants: HydrantInspectionPayload['hydrants'];
  firePumps: Array<{
    id: string;
    formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
    status: 'not_started' | 'in_progress' | 'complete' | 'not_applicable';
    observations: string;
    createdAt: string;
    updatedAt: string;
    answers: Array<{
      questionId: string;
      answer: 'si' | 'no' | 'na' | null;
      parameter: string | number | null;
      reading: string | number | null;
      comment: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }>;
  signature: InspectionSignature | undefined;
  evidence: InspectionEvidence[];
}
