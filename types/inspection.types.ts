export type InspectionStatus = 'draft' | 'pending' | 'completed' | 'mail_composer_opened' | 'sent';
export type SyncStatus = 'pending' | 'syncing' | 'partial' | 'synced' | 'error';

// A site inspection (form_type 'site_v1') stores shared site data once and a
// collection of formats. Answers are isolated by schema id inside `pumps`; the
// historical property name is kept to avoid breaking existing inspections.
export interface SiteData {
  cliente: string;
  atencion: string;
  area: string;
  fecha: string;
  tecnico: string;
  companyId?: string | null;
  companyNameSnapshot?: string;
  branchId?: string | null;
  branchNameSnapshot?: string;
}

export interface SiteFormData {
  site: SiteData;
  // Optional only for backwards compatibility. Legacy records without this
  // property are interpreted as the complete Bombas group.
  selectedFormatIds?: string[];
  pumps: Record<string, Record<string, unknown>>;
}

// form_type / form_version for the multi-pump site inspection.
export const SITE_FORM_TYPE = 'site_v1';
export const SITE_FORM_VERSION = 1;

export interface Inspection {
  id: string;
  form_type: string;
  form_version: number;
  technician_name: string;
  client_name: string;
  location: string;
  status: InspectionStatus;
  pending_comment: string | null;
  pinned: boolean;
  form_data: string;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  sync_status: SyncStatus;
  last_sync_attempt: number | null;
  synced_at: number | null;
  sync_error: string | null;
  synced_format_ids: string;
  official_report_id: string | null;
  official_report_filename: string | null;
  official_report_download_url: string | null;
}

// Lightweight row for list screens (dashboard, history). Excludes the heavy
// form_data JSON blob — use getInspection(id) when the full record is needed.
export interface InspectionListItem {
  id: string;
  technician_name: string;
  client_name: string;
  location: string;
  status: InspectionStatus;
  pending_comment: string | null;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface Photo {
  id: string;
  inspection_id: string;
  field_key: string;
  local_uri: string;
  thumbnail_uri: string | null;
  caption: string | null;
  created_at: number;
  updated_at: number;
  format_type: string;
  item_id: string | null;
  location_name_snapshot: string | null;
  sync_status: 'pending' | 'uploading' | 'synced' | 'error';
  synced_at: number | null;
  last_sync_attempt: number | null;
  sync_error: string | null;
  server_evidence_id: string | null;
  is_deleted: boolean;
  legacy: boolean;
}

export interface Signature {
  id: string;
  inspection_id: string;
  signer_type: 'technician' | 'client';
  image_base64: string;
  signed_at: number;
}
