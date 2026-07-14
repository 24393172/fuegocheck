export type ExtinguisherCheckValue = 'si' | 'no' | 'na' | '';

export interface ExtinguisherRecord {
  id: string;
  numero: string;
  ubicacion: string;
  locationId: string | null;
  locationNameSnapshot: string;
  customLocation: boolean;
  tipo_extintor: string;
  capacidad: string;
  proxima_recarga: string;
  presion: ExtinguisherCheckValue;
  presion_comentario: string;
  altura: ExtinguisherCheckValue;
  altura_comentario: string;
  seguro: ExtinguisherCheckValue;
  seguro_comentario: string;
  pintura: ExtinguisherCheckValue;
  pintura_comentario: string;
  manguera: ExtinguisherCheckValue;
  manguera_comentario: string;
  difusor: ExtinguisherCheckValue;
  difusor_comentario: string;
  senalamiento: ExtinguisherCheckValue;
  senalamiento_comentario: string;
  observaciones: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExtinguisherCollection {
  items: ExtinguisherRecord[];
}
