import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { api, query } from './api';
import { Branch, Company, EquipmentType, Location, Report } from './types';

type View = 'companies' | 'locations' | 'reports';
type Notice = { kind: 'success' | 'error'; text: string } | null;

export function App() {
  const [view, setView] = useState<View>('companies');
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (kind: 'success' | 'error', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 4200);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">E</span><div><strong>ExtinCheck</strong><small>Administración local</small></div></div>
        <nav aria-label="Navegación principal">
          <NavButton active={view === 'companies'} onClick={() => setView('companies')} label="Empresas" icon="▦" />
          <NavButton active={view === 'locations'} onClick={() => setView('locations')} label="Ubicaciones" icon="⌖" />
          <NavButton active={view === 'reports'} onClick={() => setView('reports')} label="Reportes" icon="▤" />
        </nav>
        <div className="server-badge"><span /> Servidor local</div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">Panel administrativo</span><h1>{viewTitle(view)}</h1></div><div className="local-pill">Red local</div></header>
        {notice && <div role="status" className={`notice ${notice.kind}`}>{notice.text}</div>}
        {view === 'companies' && <CompaniesView notify={notify} />}
        {view === 'locations' && <LocationsView notify={notify} />}
        {view === 'reports' && <ReportsView notify={notify} />}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: string }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function CompaniesView({ notify }: { notify: Notify }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | 'new' | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ companies: Company[] }>(`/api/companies${query({ search: search || undefined, active: status === 'all' ? undefined : status })}`);
      setCompanies(result.companies);
    } catch (error) { notify('error', message(error)); } finally { setLoading(false); }
  }, [search, status]);
  useEffect(() => { void load(); }, [load]);

  const toggleStatus = async (company: Company) => {
    if (company.active && !window.confirm('¿Estás seguro de que quieres desactivar esta empresa?\nYa no aparecerá para nuevas inspecciones, pero se conservará en el historial.')) return;
    try {
      await api(`/api/companies/${company.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !company.active }) });
      notify('success', company.active ? 'Empresa desactivada.' : 'Empresa reactivada.');
      await load();
    } catch (error) { notify('error', message(error)); }
  };

  if (selected) return <CompanyDetail company={selected} onBack={() => { setSelected(null); void load(); }} notify={notify} />;
  return <section>
    <div className="section-heading"><div><h2>Directorio de empresas</h2><p>Administra clientes disponibles para nuevas inspecciones.</p></div><button className="primary" onClick={() => setEditing('new')}>+ Nueva empresa</button></div>
    <div className="toolbar card"><label className="search-field"><span>⌕</span><input aria-label="Buscar empresa" placeholder="Buscar por nombre o razón social" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar empresas por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="true">Activas</option><option value="false">Inactivas</option></select></div>
    <div className="card table-card">{loading ? <Loading /> : companies.length === 0 ? <Empty text="No hay empresas que coincidan con los filtros." /> : <div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Razón social</th><th>Catálogo activo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><strong>{company.name}</strong></td><td>{company.businessName || '—'}</td><td>{company.activeLocations ?? 0} ubicaciones · {company.activeBranches ?? 0} sucursales</td><td><Status active={company.active} /></td><td><div className="actions"><button onClick={() => setSelected(company)}>Ver detalle</button><button onClick={() => setEditing(company)}>Editar</button><button className={company.active ? 'danger-text' : ''} onClick={() => void toggleStatus(company)}>{company.active ? 'Desactivar' : 'Reactivar'}</button></div></td></tr>)}</tbody></table></div>}</div>
    {editing && <CompanyModal company={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify('success', 'Empresa guardada correctamente.'); await load(); }} />}
  </section>;
}

function CompanyModal({ company, onClose, onSaved }: { company: Company | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(company?.name ?? '');
  const [businessName, setBusinessName] = useState(company?.businessName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(company ? `/api/companies/${company.id}` : '/api/companies', {
        method: company ? 'PUT' : 'POST', body: JSON.stringify({ name, businessName, active: company?.active ?? true }),
      }); onSaved();
    } catch (caught) { setError(message(caught)); } finally { setSaving(false); }
  };
  return <Modal title={company ? 'Editar empresa' : 'Nueva empresa'} onClose={onClose}><form onSubmit={submit} className="form-grid"><Field label="Nombre de la empresa *"><input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Razón social"><input maxLength={240} value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></Field>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar empresa'}</button></div></form></Modal>;
}

function LocationsView({ notify }: { notify: Notify }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => { api<{ companies: Company[] }>('/api/companies').then((result) => { setCompanies(result.companies); if (!selectedId && result.companies[0]) setSelectedId(result.companies[0].id); }).catch((error) => notify('error', message(error))); }, []);
  const company = companies.find((item) => item.id === selectedId);
  return <section><div className="section-heading"><div><h2>Catálogo de ubicaciones</h2><p>Selecciona una empresa para administrar Extintores e Hidrantes.</p></div><select className="company-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inactiva)'}</option>)}</select></div>{company ? <CompanyDetail company={company} locationsOnly notify={notify} /> : <Empty text="Primero crea una empresa." />}</section>;
}

function CompanyDetail({ company, onBack, notify, locationsOnly = false }: { company: Company; onBack?: () => void; notify: Notify; locationsOnly?: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [refresh, setRefresh] = useState(0);
  const loadBranches = useCallback(() => api<{ branches: Branch[] }>(`/api/companies/${company.id}/branches`).then((result) => setBranches(result.branches)).catch((error) => notify('error', message(error))), [company.id]);
  useEffect(() => { void loadBranches(); }, [loadBranches, refresh]);
  return <div className="detail-stack">{!locationsOnly && <button className="back-button" onClick={onBack}>← Volver a empresas</button>}<div className="company-hero card"><div><span className="eyebrow">Empresa</span><h2>{company.name}</h2><p>{company.businessName || 'Sin razón social registrada'}</p></div><Status active={company.active} /></div>{!locationsOnly && <BranchManager company={company} branches={branches} notify={notify} onChanged={() => setRefresh((value) => value + 1)} />}<div className="location-columns"><LocationSection company={company} branches={branches} type="extinguisher" notify={notify} refresh={refresh} /><LocationSection company={company} branches={branches} type="hydrant" notify={notify} refresh={refresh} /></div></div>;
}

function BranchManager({ company, branches, notify, onChanged }: { company: Company; branches: Branch[]; notify: Notify; onChanged: () => void }) {
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const save = async (data: { name: string; address: string }) => {
    const current = editing === 'new' ? null : editing;
    await api(current ? `/api/branches/${current.id}` : `/api/companies/${company.id}/branches`, { method: current ? 'PUT' : 'POST', body: JSON.stringify({ ...data, active: current?.active ?? true }) });
    setEditing(null); notify('success', 'Sucursal guardada.'); onChanged();
  };
  const toggle = async (branch: Branch) => { await api(`/api/branches/${branch.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !branch.active }) }); notify('success', branch.active ? 'Sucursal desactivada.' : 'Sucursal reactivada.'); onChanged(); };
  return <div className="card block"><div className="block-title"><div><h3>Sucursales</h3><p>Son opcionales; también puedes registrar ubicaciones directamente en la empresa.</p></div><button onClick={() => setEditing('new')}>+ Agregar sucursal</button></div><div className="chip-list">{branches.length ? branches.map((branch) => <div className="branch-chip" key={branch.id}><div><strong>{branch.name}</strong><small>{branch.address || 'Sin dirección'}</small></div><Status active={branch.active} /><button onClick={() => setEditing(branch)}>Editar</button><button onClick={() => void toggle(branch)}>{branch.active ? 'Desactivar' : 'Reactivar'}</button></div>) : <p className="muted">No hay sucursales. Puedes continuar sin crear una.</p>}</div>{editing && <SimpleEditor title={editing === 'new' ? 'Nueva sucursal' : 'Editar sucursal'} firstLabel="Nombre *" secondLabel="Dirección" initial={editing === 'new' ? { name: '', detail: '' } : { name: editing.name, detail: editing.address }} onClose={() => setEditing(null)} onSave={(value) => save({ name: value.name, address: value.detail })} />}</div>;
}

function LocationSection({ company, branches, type, notify, refresh }: { company: Company; branches: Branch[]; type: EquipmentType; notify: Notify; refresh: number }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const load = useCallback(async () => {
    try { const result = await api<{ locations: Location[] }>(`/api/companies/${company.id}/locations${query({ equipmentType: type, search: search || undefined, active: status === 'all' ? undefined : status, branchId: branchId === 'all' ? undefined : branchId })}`); setLocations(result.locations); } catch (error) { notify('error', message(error)); }
  }, [company.id, type, search, status, branchId, refresh]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (location: Location) => {
    if (location.active && !window.confirm('¿Estás seguro de que quieres desactivar esta ubicación?\nNo aparecerá para nuevas inspecciones, pero seguirá visible en reportes anteriores.')) return;
    try { await api(`/api/locations/${location.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !location.active }) }); notify('success', location.active ? 'Ubicación desactivada.' : 'Ubicación reactivada.'); await load(); } catch (error) { notify('error', message(error)); }
  };
  return <div className="card block location-block"><div className="block-title"><div><span className={`equipment-dot ${type}`} /><h3>{type === 'extinguisher' ? 'Ubicaciones de Extintores' : 'Ubicaciones de Hidrantes'}</h3></div><button onClick={() => setEditing('new')}>+ Agregar</button></div><div className="mini-filters"><input aria-label={`Buscar ubicaciones de ${type}`} placeholder="Buscar ubicación" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filtrar por sucursal" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">Todas las sucursales</option><option value="none">Sin sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select aria-label="Filtrar ubicaciones por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="true">Activas</option><option value="false">Inactivas</option></select></div><div className="location-list">{locations.length ? locations.map((location) => <article key={location.id} className="location-item"><div><strong>{location.name}</strong><small>{[location.branchName, location.area, location.floor && `Piso ${location.floor}`].filter(Boolean).join(' · ') || 'Directa en empresa'}</small><span>{location.reference}</span></div><Status active={location.active} /><div className="actions"><button onClick={() => setEditing(location)}>Editar</button><button className={location.active ? 'danger-text' : ''} onClick={() => void toggle(location)}>{location.active ? 'Desactivar' : 'Reactivar'}</button></div></article>) : <Empty text="No hay ubicaciones con estos filtros." />}</div>{editing && <LocationModal company={company} branches={branches} type={type} location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify('success', 'Ubicación guardada.'); await load(); }} />}</div>;
}

function LocationModal({ company, branches, type, location, onClose, onSaved }: { company: Company; branches: Branch[]; type: EquipmentType; location: Location | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: location?.name ?? '', branchId: location?.branchId ?? '', area: location?.area ?? '', floor: location?.floor ?? '', reference: location?.reference ?? '' });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { await api(location ? `/api/locations/${location.id}` : `/api/companies/${company.id}/locations`, { method: location ? 'PUT' : 'POST', body: JSON.stringify({ ...form, branchId: form.branchId || null, equipmentType: type, active: location?.active ?? true }) }); onSaved(); } catch (caught) { setError(message(caught)); } finally { setSaving(false); } };
  return <Modal title={location ? 'Editar ubicación' : `Nueva ubicación de ${type === 'extinguisher' ? 'Extintor' : 'Hidrante'}`} onClose={onClose}><form className="form-grid two-columns" onSubmit={submit}><Field label="Nombre de la ubicación *"><input autoFocus required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Sucursal"><select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="">Sin sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><Field label="Área"><input maxLength={500} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></Field><Field label="Piso"><input maxLength={120} value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} /></Field><Field label="Referencia"><textarea maxLength={500} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>{error && <p className="form-error">{error}</p>}<div className="modal-actions full"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ubicación'}</button></div></form></Modal>;
}

function ReportsView({ notify }: { notify: Notify }) {
  const [reports, setReports] = useState<Report[]>([]); const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(''); const [date, setDate] = useState(''); const [status, setStatus] = useState(''); const [format, setFormat] = useState('');
  useEffect(() => { api<{ reports: Report[] }>('/api/reports').then((result) => setReports(result.reports)).catch((error) => notify('error', message(error))).finally(() => setLoading(false)); }, []);
  const companies = useMemo(() => [...new Set(reports.map((report) => report.companyName))].sort(), [reports]);
  const visible = reports.filter((report) => (!company || report.companyName === company) && (!date || report.inspectionDate === date) && (!status || report.status === status) && (!format || report.formatType === format));
  return <section><div className="section-heading"><div><h2>Reportes Excel</h2><p>Consulta los archivos generados por las inspecciones sincronizadas.</p></div><span className="count-pill">{visible.length} reportes</span></div><div className="toolbar card report-filters"><select aria-label="Filtrar reportes por empresa" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">Todas las empresas</option>{companies.map((name) => <option key={name}>{name}</option>)}</select><input aria-label="Filtrar reportes por fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><select aria-label="Filtrar reportes por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option><option value="generated">Generados</option><option value="error">Con error</option></select><select aria-label="Filtrar reportes por formato" value={format} onChange={(event) => setFormat(event.target.value)}><option value="">Todos los formatos</option><option value="extinguishers">EXTINTORES</option></select></div><div className="card table-card">{loading ? <Loading /> : <div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Inspección</th><th>Formato</th><th>Generado</th><th>Estado</th><th>Archivo</th><th>Acción</th></tr></thead><tbody>{visible.map((report) => <tr key={report.id}><td><strong>{report.companyName}</strong></td><td>{displayDate(report.inspectionDate)}</td><td><span className="format-badge">EXTINTORES</span></td><td>{displayDateTime(report.generatedAt)}</td><td><ReportStatus report={report} /></td><td className="filename">{report.filename}</td><td>{report.downloadUrl ? <a className="download-button" href={`/api/reports/${report.id}/download`}>Descargar</a> : '—'}</td></tr>)}</tbody></table>{!visible.length && <Empty text="No hay reportes con estos filtros." />}</div>}</div></section>;
}

function ReportStatus({ report }: { report: Report }) { return <div><span className={`report-status ${report.status}`}>{report.status === 'generated' ? 'Generado' : 'Error'}</span>{report.status === 'error' && <small className="error-detail">{report.errorMessage || 'No fue posible generar el archivo.'}</small>}</div>; }
function Status({ active }: { active: boolean }) { return <span className={active ? 'status active' : 'status inactive'}><i />{active ? 'Activa' : 'Inactiva'}</span>; }
function Loading() { return <div className="loading"><span /> Cargando información…</div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h3>{title}</h3><button aria-label="Cerrar" onClick={onClose}>×</button></div>{children}</div></div>; }
function SimpleEditor({ title, firstLabel, secondLabel, initial, onClose, onSave }: { title: string; firstLabel: string; secondLabel: string; initial: { name: string; detail: string }; onClose: () => void; onSave: (value: { name: string; detail: string }) => Promise<void> }) { const [value, setValue] = useState(initial); const [error, setError] = useState(''); return <Modal title={title} onClose={onClose}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSave(value).catch((caught) => setError(message(caught))); }}><Field label={firstLabel}><input required maxLength={160} value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></Field><Field label={secondLabel}><input maxLength={500} value={value.detail} onChange={(event) => setValue({ ...value, detail: event.target.value })} /></Field>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Guardar</button></div></form></Modal>; }

type Notify = (kind: 'success' | 'error', text: string) => void;
function message(error: unknown) { return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'; }
function viewTitle(view: View) { return ({ companies: 'Empresas', locations: 'Ubicaciones', reports: 'Reportes' } as const)[view]; }
function displayDate(value: string) { const [year, month, day] = value.split('-'); return year && month && day ? `${day}/${month}/${year}` : value; }
function displayDateTime(value: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
