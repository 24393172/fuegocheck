export type FieldType =
  | 'text'
  | 'number'
  | 'yes_no_na'
  | 'photo'
  | 'signature'
  | 'select'
  | 'textarea';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  section: string;
  options?: string[];
  // Fixed reference text printed on the paper form (e.g. "NFPA 20"). Shown in
  // the Excel "Parámetros" column. The technician does NOT fill this in.
  parametro?: string;
  // Keys of the `number` fields (same section, listed right after this one)
  // whose values are the "Lecturas" for this question — e.g. voltage per phase.
  // In the Excel they render on this question's row instead of as their own rows.
  readingKeys?: string[];
}

export interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  name: string;
  version: number;
  sections: FormSection[];
}
