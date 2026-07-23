export type PumpFormType = 'pump_jockey' | 'pump_electric' | 'pump_diesel';

export interface PumpQuestionCellMap {
  row: number;
  yesCell: string;
  naCell: string;
  noCell: string;
  commentCell: string;
  parameterCell?: string;
  fixedParameter?: string;
}

export interface PumpSheetConfig {
  formType: PumpFormType;
  mobileId: 'jockey' | 'electrica' | 'diesel';
  sheetName: 'B Jockey' | 'B Electrica' | 'B Diesel';
  identityCells: Record<'potencia' | 'capacidad' | 'voltaje', string>;
  generalCells: Record<'cliente' | 'atencion' | 'area' | 'fecha', string>;
  observationsCell: string;
  questions: Record<string, PumpQuestionCellMap>;
  readingCells: Record<string, string>;
}

function question(
  row: number,
  options: { parameterCell?: string; fixedParameter?: string } = {}
): PumpQuestionCellMap {
  return {
    row,
    yesCell: `Q${row}`,
    naCell: `S${row}`,
    noCell: `U${row}`,
    commentCell: `AE${row}`,
    ...options,
  };
}

function questions(
  rows: Array<[string, number]>,
  parameters: Record<string, { cell: string; value: string }> = {}
): Record<string, PumpQuestionCellMap> {
  return Object.fromEntries(rows.map(([id, row]) => [
    id,
    question(row, parameters[id]
      ? { parameterCell: parameters[id].cell, fixedParameter: parameters[id].value }
      : undefined),
  ]));
}

const GENERAL = { cliente: 'F9', atencion: 'F10', area: 'F11', fecha: 'F12' } as const;

export const FIRE_PUMP_CONFIG: Record<PumpFormType, PumpSheetConfig> = {
  pump_jockey: {
    formType: 'pump_jockey',
    mobileId: 'jockey',
    sheetName: 'B Jockey',
    identityCells: { potencia: 'AI10', capacidad: 'AI11', voltaje: 'AI12' },
    generalCells: GENERAL,
    observationsCell: 'F55',
    questions: questions([
      ['1_1', 17], ['1_2', 18], ['1_3', 19], ['1_4', 20], ['1_5', 21],
      ['1_6', 22], ['1_7', 23], ['1_8', 24],
      ['2_1', 26], ['2_2', 27], ['2_3', 28], ['2_4', 29], ['2_5', 30],
      ['3_1', 32], ['3_2', 33], ['3_3', 35], ['3_4', 36], ['3_5', 39],
      ['3_6', 42], ['3_7', 45], ['3_8', 46], ['3_9', 47], ['3_10', 48],
      ['3_11', 49], ['3_12', 50], ['3_13', 51], ['3_14', 52],
    ], { '2_5': { cell: 'W30', value: 'NFPA 20' } }),
    readingCells: {
      potencia: 'AI10', capacidad: 'AI11', voltaje: 'AI12',
      '3_2_presion_arranque': 'AA33', '3_2_presion_paro': 'AA34',
      '3_3_segundos': 'AA35',
      '3_4_v_entrada_f1': 'AA36', '3_4_v_entrada_f2': 'AA37', '3_4_v_entrada_f3': 'AA38',
      '3_5_v_salida_f1': 'AA39', '3_5_v_salida_f2': 'AA40', '3_5_v_salida_f3': 'AA41',
      '3_6_amp_f1': 'AA42', '3_6_amp_f2': 'AA43', '3_6_amp_f3': 'AA44',
    },
  },
  pump_electric: {
    formType: 'pump_electric',
    mobileId: 'electrica',
    sheetName: 'B Electrica',
    identityCells: { potencia: 'AI10', capacidad: 'AI11', voltaje: 'AI12' },
    generalCells: GENERAL,
    observationsCell: 'F60',
    questions: questions([
      ['1_1', 17], ['1_2', 18], ['1_3', 19], ['1_4', 20], ['1_5', 21],
      ['1_6', 22], ['1_7', 23], ['1_8', 24], ['1_9', 25], ['1_10', 26], ['1_11', 27],
      ['2_1', 29], ['2_2', 30], ['2_3', 31], ['2_4', 32], ['2_5', 33], ['2_6', 34],
      ['3_1', 36], ['3_2', 37], ['3_3', 38], ['3_4', 40], ['3_5', 41],
      ['3_6', 44], ['3_7', 47], ['3_8', 50], ['3_9', 51], ['3_10', 52],
      ['3_11', 53], ['3_12', 54], ['3_13', 55], ['3_14', 56], ['3_15', 57],
    ], { '2_6': { cell: 'W34', value: 'NFPA 20' } }),
    readingCells: {
      potencia: 'AI10', capacidad: 'AI11', voltaje: 'AI12',
      '3_3_presion_arranque': 'AA38', '3_3_presion_paro': 'AA39',
      '3_4_segundos': 'AA40',
      '3_5_v_entrada_f1': 'AA41', '3_5_v_entrada_f2': 'AA42', '3_5_v_entrada_f3': 'AA43',
      '3_6_v_salida_f1': 'AA44', '3_6_v_salida_f2': 'AA45', '3_6_v_salida_f3': 'AA46',
      '3_7_amp_f1': 'AA47', '3_7_amp_f2': 'AA48', '3_7_amp_f3': 'AA49',
    },
  },
  pump_diesel: {
    formType: 'pump_diesel',
    mobileId: 'diesel',
    sheetName: 'B Diesel',
    identityCells: { potencia: 'AH10', capacidad: 'AH11', voltaje: 'AH12' },
    generalCells: GENERAL,
    observationsCell: 'F83',
    questions: questions([
      ['1_1', 17], ['1_2', 18], ['1_3', 19], ['1_4', 20], ['1_5', 21],
      ['1_6', 22], ['1_7', 23], ['1_8', 24], ['1_9', 25], ['1_10', 26], ['1_11', 27],
      ['2_1', 29], ['2_2', 30], ['2_3', 32],
      ['3_1', 35], ['3_2', 36], ['3_3', 37],
      ['4_1', 39], ['4_2', 40], ['4_3', 41], ['4_4', 42],
      ['5_1', 44], ['5_2', 45], ['5_3', 46], ['5_4', 47], ['5_5', 48],
      ['6_1', 51], ['6_2', 52], ['6_3', 53], ['6_5', 55], ['6_6', 56],
      ['7_1', 58], ['7_2', 60], ['7_3', 61], ['7_4', 62], ['7_5', 63],
      ['7_6', 64], ['7_7', 65], ['7_8', 66], ['7_9', 67], ['7_10', 68],
      ['7_11', 69], ['7_12', 70], ['7_13', 71], ['7_14', 72],
      ['7_17', 73], ['7_18', 74], ['7_19', 75], ['7_20', 76],
      ['7_21', 77], ['7_22', 78], ['7_23', 79], ['7_24', 80],
    ], {
      '4_3': { cell: 'W41', value: '2/3 NFPA 20' },
      '6_6': { cell: 'W56', value: 'NFPA 20' },
      '7_12': { cell: 'W70', value: '30 a 75 Psi' },
      '7_13': { cell: 'W71', value: '82°C a 93° C' },
      '7_14': { cell: 'W72', value: '15 a 30 Psi' },
    }),
    readingCells: {
      potencia: 'AH10', capacidad: 'AH11', voltaje: 'AH12',
      '2_2_banco_1': 'AA30', '2_2_banco_2': 'AA31',
      '2_3_banco_1': 'AA32', '2_3_banco_2': 'AA33',
      '5_5_banco_1': 'AA48', '5_5_banco_2': 'AA49',
      '6_3_banco_1': 'AA53', '6_3_banco_2': 'AA54',
      '7_1_presion_arranque': 'AA58', '7_1_presion_paro': 'AA59',
    },
  },
};

export const FIRE_PUMP_FORM_TYPES = Object.keys(FIRE_PUMP_CONFIG) as PumpFormType[];
export const FIRE_PUMP_MOBILE_IDS = FIRE_PUMP_FORM_TYPES.map(
  (formType) => FIRE_PUMP_CONFIG[formType].mobileId
);

export const FIRE_PUMP_ALLOWED_IDS: Record<PumpFormType, Set<string>> = Object.fromEntries(
  FIRE_PUMP_FORM_TYPES.map((formType) => {
    const config = FIRE_PUMP_CONFIG[formType];
    return [formType, new Set([
      ...Object.keys(config.questions),
      ...Object.keys(config.readingCells),
    ])];
  })
) as Record<PumpFormType, Set<string>>;
