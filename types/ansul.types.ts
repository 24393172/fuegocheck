export type AnsulFormStatus = 'not_started' | 'in_progress' | 'complete' | 'not_applicable';
export type AnsulAnswerValue = 'si' | 'no' | 'na';

export interface AnsulAnswer {
  questionId: string;
  answer?: AnsulAnswerValue;
  quantity?: string | number;
  model?: string | number;
  comment?: string;
  // Kept only so legacy structured values are not discarded. The official
  // Ansul sheet has no verified parameter/reading cells for these values.
  legacyParameter?: string | number;
  legacyReading?: string | number;
}

export interface AnsulNormalizationIssue {
  source: string;
  questionId?: string;
  message: string;
}

export interface AnsulData {
  status: AnsulFormStatus;
  systemName: string;
  capacityGallons: string;
  answers: Record<string, AnsulAnswer>;
  observations: string;
  normalizationIssues: AnsulNormalizationIssue[];
  updatedAt: number;
}
