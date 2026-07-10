import { getDatabase } from '../db';
import { generateId } from '../uuid';

export interface Company {
  id: string;
  name: string;
  area: string;
  attention: string;
  created_at: number;
  updated_at?: number;
}

export async function getCompany(id: string): Promise<Company | null> {
  return getDatabase().getFirstAsync<Company>('SELECT * FROM companies WHERE id = ?', [id]);
}

export async function createCompany(input: Pick<Company, 'name' | 'area' | 'attention'>): Promise<Company> {
  const company = { id: generateId(), ...input, created_at: Date.now() };
  await getDatabase().runAsync(
    'INSERT INTO companies (id, name, area, attention, created_at) VALUES (?, ?, ?, ?, ?)',
    [company.id, company.name.trim(), company.area.trim(), company.attention.trim(), company.created_at]
  );
  return company;
}

export async function updateCompany(id: string, input: Pick<Company, 'name' | 'area' | 'attention'>): Promise<void> {
  await getDatabase().runAsync(
    'UPDATE companies SET name = ?, area = ?, attention = ? WHERE id = ?',
    [input.name.trim(), input.area.trim(), input.attention.trim(), id]
  );
}

export async function deleteCompany(id: string): Promise<void> {
  await getDatabase().runAsync('DELETE FROM companies WHERE id = ?', [id]);
}

export async function getCompanies(): Promise<Company[]> {
  const db = getDatabase();
  return db.getAllAsync<Company>(
    'SELECT id, name, area, attention, created_at FROM companies ORDER BY name ASC',
    []
  );
}
