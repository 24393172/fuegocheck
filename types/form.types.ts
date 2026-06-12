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
