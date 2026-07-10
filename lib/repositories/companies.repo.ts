import { getDatabase } from '../db';

export interface Company {
  id: string;
  name: string;
  area: string;
  attention: string;
  created_at: number;
}

export async function getCompanies(): Promise<Company[]> {
  const db = getDatabase();
  return db.getAllAsync<Company>(
    'SELECT id, name, area, attention, created_at FROM companies ORDER BY name ASC',
    []
  );
}
