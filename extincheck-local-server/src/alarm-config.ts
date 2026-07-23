export const ALARM_MOBILE_IDS = [
  'tablero_ad',
  'dispositivos_ad',
  'dispositivos_convencionales',
  'dispositivos_notificacion',
] as const;

export const ALARM_FORM_TYPES = [
  'alarm_panel',
  'addressed_devices',
  'conventional_devices',
  'notification_devices',
] as const;

export type AlarmFormType = typeof ALARM_FORM_TYPES[number];
export type AlarmDeviceFormType = Exclude<AlarmFormType, 'alarm_panel'>;

export const ALARM_PANEL_QUESTION_CELLS = Object.fromEntries([
  ...Array.from({ length: 11 }, (_, index) => [`1_${index + 1}`, 18 + index] as const),
  ...Array.from({ length: 17 }, (_, index) => [`2_${index + 1}`, 30 + index] as const),
].map(([questionId, row]) => [questionId, {
  yesCell: `Q${row}`,
  naCell: `S${row}`,
  noCell: `U${row}`,
  parameterCell: `W${row}`,
  readingCell: `AA${row}`,
  commentCell: `AE${row}`,
}])) as Record<string, {
  yesCell: string;
  naCell: string;
  noCell: string;
  parameterCell: string;
  readingCell: string;
  commentCell: string;
}>;

export const ALARM_PANEL_ALLOWED_IDS = new Set(Object.keys(ALARM_PANEL_QUESTION_CELLS));

export const ALARM_DEVICE_CONFIG: Record<AlarmDeviceFormType, {
  sheetName: string;
  firstRow: number;
  lastRow: number;
  columns: {
    identifier: string;
    loop: string;
    deviceType: string;
    location: string;
    alarm: string;
    supervision: string;
    cleaning: string;
    comments: string;
  };
}> = {
  addressed_devices: {
    sheetName: 'Dispositivos A&D',
    firstRow: 17,
    lastRow: 36,
    columns: {
      identifier: 'A', loop: 'D', deviceType: 'F', location: 'N',
      alarm: 'W', supervision: 'Z', cleaning: 'AD', comments: 'AG',
    },
  },
  conventional_devices: {
    sheetName: 'Dispositivos Convencionales',
    firstRow: 17,
    lastRow: 36,
    columns: {
      identifier: 'A', loop: 'D', deviceType: 'F', location: 'N',
      alarm: 'W', supervision: 'Z', cleaning: 'AD', comments: 'AG',
    },
  },
  notification_devices: {
    sheetName: 'Dispositivos Notificacion',
    firstRow: 17,
    lastRow: 36,
    columns: {
      identifier: 'A', loop: 'D', deviceType: 'F', location: 'N',
      alarm: 'W', supervision: 'Z', cleaning: 'AD', comments: 'AG',
    },
  },
};

export const MAX_ALARM_DEVICES = 20;
