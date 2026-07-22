export interface Company {
  id: string;
  name: string;
  businessName: string;
  active: boolean;
  activeBranches?: number;
  activeLocations?: number;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  address: string;
  active: boolean;
}

export type EquipmentType = 'extinguisher' | 'hydrant';

export interface Location {
  id: string;
  companyId: string;
  branchId: string | null;
  branchName: string | null;
  equipmentType: EquipmentType;
  name: string;
  area: string;
  floor: string;
  reference: string;
  active: boolean;
}

export interface Report {
  id: string;
  inspectionId: string;
  formatType: string;
  formats: string;
  filename: string;
  generatedAt: string;
  status: 'generated' | 'error';
  errorMessage: string | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: 'generated' | 'error' | null;
  lastAttemptError: string | null;
  signatureAvailable: boolean;
  signatureSignerName: string | null;
  signatureSignedAt: string | null;
  templateVersion: string;
  companyName: string;
  inspectionDate: string;
  downloadUrl: string | null;
}
