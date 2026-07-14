export type CatalogEquipmentType = 'extinguisher' | 'hydrant';

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

export interface CatalogLocation {
  id: string;
  companyId: string;
  branchId: string | null;
  equipmentType: CatalogEquipmentType;
  name: string;
  area: string;
  floor: string;
  reference: string;
  active: boolean;
  serverUpdatedAt: string;
  syncedAt: number;
}

export interface CatalogStatus {
  version: string | null;
  lastSync: number | null;
  serverUrl: string;
  companies: number;
  extinguisherLocations: number;
  hydrantLocations: number;
}
