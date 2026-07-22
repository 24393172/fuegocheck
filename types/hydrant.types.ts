export type HydrantCheckValue = 'si' | 'no' | 'na' | '';

export interface HydrantRecord {
  id: string;
  numero: string;
  ubicacion: string;
  locationId: string | null;
  locationNameSnapshot: string;
  customLocation: boolean;
  gabinete: HydrantCheckValue;
  gabinete_comentario: string;
  senalamiento: HydrantCheckValue;
  senalamiento_comentario: string;
  calcomania: HydrantCheckValue;
  calcomania_comentario: string;
  valvula_angular: HydrantCheckValue;
  valvula_angular_comentario: string;
  manguera: HydrantCheckValue;
  manguera_comentario: string;
  chiflon: HydrantCheckValue;
  chiflon_comentario: string;
  llave_acople: HydrantCheckValue;
  llave_acople_comentario: string;
  observaciones: string;
  createdAt: number;
  updatedAt: number;
}

export interface HydrantCollection {
  items: HydrantRecord[];
}
