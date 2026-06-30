export type InspectionStatus = 'draft' | 'completed' | 'sent';

// A site inspection (form_type 'site_v1') stores its data as this shape inside
// form_data: shared site fields plus one answers object per pump, keyed by the
// pump schema id ('jockey' | 'diesel' | 'electrica').
export interface SiteData {
  cliente: string;
  atencion: string;
  area: string;
  fecha: string;
  tecnico: string;
}

export interface SiteFormData {
  site: SiteData;
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
  form_data: string;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
}

// Lightweight row for list screens (dashboard, history). Excludes the heavy
// form_data JSON blob — use getInspection(id) when the full record is needed.
export interface InspectionListItem {
  id: string;
  technician_name: string;
  client_name: string;
  location: string;
  status: InspectionStatus;
  created_at: number;
}

export interface Photo {
  id: string;
  inspection_id: string;
  field_key: string;
  local_uri: string;
  thumbnail_uri: string | null;
  caption: string | null;
  created_at: number;
}

export interface Signature {
  id: string;
  inspection_id: string;
  signer_type: 'technician' | 'client';
  image_base64: string;
  signed_at: number;
}
