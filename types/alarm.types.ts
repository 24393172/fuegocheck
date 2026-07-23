export type AlarmFormStatus = 'not_started' | 'in_progress' | 'complete' | 'not_applicable';
export type AlarmCheckValue = 'si' | 'no' | 'na' | '';
export type AlarmDeviceFormId =
  | 'addressedDevices'
  | 'conventionalDevices'
  | 'notificationDevices';
export type AlarmMobileFormId =
  | 'tablero_ad'
  | 'dispositivos_ad'
  | 'dispositivos_convencionales'
  | 'dispositivos_notificacion';
export type AlarmServerFormType =
  | 'alarm_panel'
  | 'addressed_devices'
  | 'conventional_devices'
  | 'notification_devices';

export interface AlarmAnswer {
  questionId: string;
  answer?: Exclude<AlarmCheckValue, ''>;
  parameter?: string | number;
  reading?: string | number;
  comment?: string;
}

export interface AlarmPanelData {
  status: AlarmFormStatus;
  answers: Record<string, AlarmAnswer>;
  observations: string;
  updatedAt: number;
}

export interface AlarmDeviceItem {
  id: string;
  identifier: string;
  loop: string;
  deviceType: string;
  locationId: string | null;
  locationNameSnapshot: string;
  customLocation: boolean;
  alarm: AlarmCheckValue;
  supervision: AlarmCheckValue;
  cleaning: AlarmCheckValue;
  observations: string;
  createdAt: number;
  updatedAt: number;
}

export interface AlarmDeviceCollection {
  status: AlarmFormStatus;
  items: AlarmDeviceItem[];
  observations: string;
  updatedAt: number;
}

export interface AlarmSystemDiscrepancy {
  source: string;
  value: string;
}

export interface AlarmsData {
  systemName: string;
  systemNameDiscrepancies: AlarmSystemDiscrepancy[];
  panel: AlarmPanelData;
  addressedDevices: AlarmDeviceCollection;
  conventionalDevices: AlarmDeviceCollection;
  notificationDevices: AlarmDeviceCollection;
}
