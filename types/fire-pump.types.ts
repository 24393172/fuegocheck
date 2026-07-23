export type FirePumpFormId = 'jockey' | 'electrica' | 'diesel';

export type FirePumpFormStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'not_applicable';

export type FirePumpAnswerValue = 'si' | 'no' | 'na';

export interface FirePumpAnswer {
  questionId: string;
  answer?: FirePumpAnswerValue;
  parameter?: string | number;
  reading?: string | number;
  comment?: string;
}

export interface FirePumpFormData {
  status: FirePumpFormStatus;
  answers: Record<string, FirePumpAnswer>;
  observations: string;
  updatedAt: number;
}

export interface FirePumpsData {
  jockey: FirePumpFormData;
  electrica: FirePumpFormData;
  diesel: FirePumpFormData;
}

