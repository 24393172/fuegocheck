export const ANSUL_FORMAT_ID = 'ansul_r102' as const;
export const ANSUL_EVIDENCE_FORMAT = 'ansul' as const;
export const ANSUL_FORM_TYPE = 'ansul_r102' as const;
export const ANSUL_QUESTION_IDS = Array.from({ length: 17 }, (_, index) => String(index + 1));
export const ANSUL_ALLOWED_IDS = new Set(ANSUL_QUESTION_IDS);
export const MAX_ANSUL_OBSERVATION_LINES = 8;
export const MAX_ANSUL_OBSERVATION_LINE_LENGTH = 120;
export const MAX_ANSUL_OBSERVATIONS_LENGTH =
  MAX_ANSUL_OBSERVATION_LINES * MAX_ANSUL_OBSERVATION_LINE_LENGTH;

export const ANSUL_QUESTION_CELLS = Object.fromEntries(
  ANSUL_QUESTION_IDS.map((questionId, index) => {
    const row = 17 + index;
    return [questionId, {
      yesCell: `Q${row}`,
      naCell: `S${row}`,
      noCell: `U${row}`,
      quantityCell: `W${row}`,
      modelCell: `AA${row}`,
      commentCell: `AE${row}`,
    }];
  })
) as Record<string, {
  yesCell: string;
  naCell: string;
  noCell: string;
  quantityCell: string;
  modelCell: string;
  commentCell: string;
}>;

export function wrapAnsulObservations(value: string): {
  lines: string[];
  valid: boolean;
  message?: string;
} {
  if (value.length > MAX_ANSUL_OBSERVATIONS_LENGTH) {
    return {
      lines: [],
      valid: false,
      message: `Ansul observations cannot exceed ${MAX_ANSUL_OBSERVATIONS_LENGTH} characters`,
    };
  }
  const lines: string[] = [];
  for (const explicitLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!explicitLine) {
      lines.push('');
      continue;
    }
    let remaining = explicitLine;
    while (remaining.length > MAX_ANSUL_OBSERVATION_LINE_LENGTH) {
      const candidate = remaining.slice(0, MAX_ANSUL_OBSERVATION_LINE_LENGTH + 1);
      const breakAt = candidate.lastIndexOf(' ') > 0
        ? candidate.lastIndexOf(' ')
        : MAX_ANSUL_OBSERVATION_LINE_LENGTH;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).replace(/^ /, '');
    }
    lines.push(remaining);
  }
  return lines.length <= MAX_ANSUL_OBSERVATION_LINES
    ? { lines, valid: true }
    : {
      lines,
      valid: false,
      message: `Ansul observations require ${lines.length} lines; maximum is ${MAX_ANSUL_OBSERVATION_LINES}`,
    };
}
