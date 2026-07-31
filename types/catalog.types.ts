export type CatalogEquipmentType =
  | 'extinguisher'
  | 'hydrant'
  | 'addressed_device'
  | 'conventional_device'
  | 'notification_device';

export interface CatalogCompany {
  id: string;
  name: string;
  businessName: string;
  active: boolean;
  serverUpdatedAt: string;
  syncedAt: number;
}

export interface CatalogBranch {
  id: string;
  companyId: string;
  name: string;
  address: string;
  active: boolean;
  serverUpdatedAt: string;
  syncedAt: number;
}

interface CatalogLocationBase {
  id: string;
  companyId: string;
  equipmentType: CatalogEquipmentType;
  name: string;
  active: boolean;
  serverUpdatedAt: string;
  syncedAt: number;
}

export interface CatalogExtinguisherLocation extends CatalogLocationBase {
  equipmentType: 'extinguisher';
  identifier: string;
  extinguisherType: string;
  capacity: string;
}

export interface CatalogStandardLocation extends CatalogLocationBase {
  equipmentType: Exclude<CatalogEquipmentType, 'extinguisher'>;
  branchId: string | null;
  area: string;
  floor: string;
  reference: string;
}

export type CatalogLocation = CatalogExtinguisherLocation | CatalogStandardLocation;

export interface CatalogStatus {
  version: string | null;
  lastSync: number | null;
  serverUrl: string;
  companies: number;
  extinguisherLocations: number;
  hydrantLocations: number;
  alarmLocations: number;
}
