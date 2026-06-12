export type InspectionStatus = 'draft' | 'completed' | 'sent';

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
