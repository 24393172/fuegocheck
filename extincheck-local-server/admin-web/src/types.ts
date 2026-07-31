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

export type EquipmentType =
  | 'extinguisher'
  | 'hydrant'
  | 'addressed_device'
  | 'conventional_device'
  | 'notification_device';

interface BaseLocation {
  id: string;
  companyId: string;
  equipmentType: EquipmentType;
  name: string;
  active: boolean;
}

export interface ExtinguisherLocation extends BaseLocation {
  equipmentType: 'extinguisher';
  identifier: string;
  extinguisherType: string;
  capacity: string;
}

export interface StandardLocation extends BaseLocation {
  equipmentType: Exclude<EquipmentType, 'extinguisher'>;
  branchId: string | null;
  branchName: string | null;
  area: string;
  floor: string;
  reference: string;
}

export type Location = ExtinguisherLocation | StandardLocation;

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
  evidenceCount: number;
  firePumpForms: Array<{
    formType: 'pump_jockey' | 'pump_electric' | 'pump_diesel';
    status: string;
    updatedAt: string;
    answered: number;
    total: number;
  }>;
  alarmForms: Array<{
    formType: 'alarm_panel' | 'addressed_devices' | 'conventional_devices' | 'notification_devices';
    status: string;
    updatedAt: string;
    itemCount: number;
    answered: number;
  }>;
  ansulForm?: {
    status: string;
    systemName: string;
    capacityGallons: string;
    updatedAt: string;
    answered: number;
  };
  templateVersion: string;
  companyName: string;
  inspectionDate: string;
  downloadUrl: string | null;
}

export interface Evidence {
  id: string;
  formatType: string;
  formType: string | null;
  itemId: string | null;
  equipmentLabel: string | null;
  fieldKey: string;
  caption: string | null;
  locationNameSnapshot: string | null;
  capturedAt: string;
  width: number;
  height: number;
  fileUrl: string;
  thumbnailUrl: string;
}
