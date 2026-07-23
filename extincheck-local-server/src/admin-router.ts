import { RequestHandler, Router } from 'express';
import { ZodError } from 'zod';
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminRepository,
  AdminValidationError,
} from './admin-repository.js';
import {
  branchInputSchema,
  companyInputSchema,
  equipmentTypeSchema,
  locationInputSchema,
  statusInputSchema,
  uuidSchema,
} from './admin-validation.js';

export function createAdminRouter(
  repository: AdminRepository,
  requireAdminSession: RequestHandler,
  requireAdminCsrf: RequestHandler,
  rateLimit: RequestHandler
) {
  const router = Router();
  router.use(
    ['/companies', '/branches', '/locations'],
    rateLimit,
    requireAdminSession,
    requireAdminCsrf
  );

  router.get('/companies', (request, response) => {
    response.json({
      ok: true,
      companies: repository.listCompanies({
        search: textQuery(request.query.search),
        active: booleanQuery(request.query.active),
      }),
    });
  });

  router.post('/companies', (request, response) => {
    const result = repository.createCompany(companyInputSchema.parse(request.body));
    response.status(result.created ? 201 : 200).json({ ok: true, ...result });
  });

  router.get('/companies/:id', (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const company = repository.getCompany(id);
    if (!company) throw new AdminNotFoundError('Empresa no encontrada.');
    response.json({ ok: true, company });
  });

  router.put('/companies/:id', (request, response) => {
    const company = repository.updateCompany(
      uuidSchema.parse(request.params.id),
      companyInputSchema.parse(request.body)
    );
    response.json({ ok: true, company });
  });

  router.patch('/companies/:id/status', (request, response) => {
    const { active } = statusInputSchema.parse(request.body);
    const company = repository.setCompanyStatus(uuidSchema.parse(request.params.id), active);
    response.json({ ok: true, company });
  });

  router.get('/companies/:id/branches', (request, response) => {
    const branches = repository.listBranches(
      uuidSchema.parse(request.params.id),
      booleanQuery(request.query.active)
    );
    response.json({ ok: true, branches });
  });

  router.post('/companies/:id/branches', (request, response) => {
    const result = repository.createBranch(
      uuidSchema.parse(request.params.id),
      branchInputSchema.parse(request.body)
    );
    response.status(result.created ? 201 : 200).json({ ok: true, ...result });
  });

  router.put('/branches/:id', (request, response) => {
    const branch = repository.updateBranch(
      uuidSchema.parse(request.params.id),
      branchInputSchema.parse(request.body)
    );
    response.json({ ok: true, branch });
  });

  router.patch('/branches/:id/status', (request, response) => {
    const { active } = statusInputSchema.parse(request.body);
    const branch = repository.setBranchStatus(uuidSchema.parse(request.params.id), active);
    response.json({ ok: true, branch });
  });

  router.get('/companies/:id/locations', (request, response) => {
    const equipmentType = textQuery(request.query.equipmentType);
    const branchId = textQuery(request.query.branchId);
    const locations = repository.listLocations(uuidSchema.parse(request.params.id), {
      equipmentType: equipmentType ? equipmentTypeSchema.parse(equipmentType) : undefined,
      branchId: branchId === 'none' ? null : branchId ? uuidSchema.parse(branchId) : undefined,
      active: booleanQuery(request.query.active),
      search: textQuery(request.query.search),
    });
    response.json({ ok: true, locations });
  });

  router.post('/companies/:id/locations', (request, response) => {
    const location = repository.createLocation(
      uuidSchema.parse(request.params.id),
      locationInputSchema.parse(request.body)
    );
    response.status(201).json({ ok: true, location });
  });

  router.put('/locations/:id', (request, response) => {
    const location = repository.updateLocation(
      uuidSchema.parse(request.params.id),
      locationInputSchema.parse(request.body)
    );
    response.json({ ok: true, location });
  });

  router.patch('/locations/:id/status', (request, response) => {
    const { active } = statusInputSchema.parse(request.body);
    const location = repository.setLocationStatus(uuidSchema.parse(request.params.id), active);
    response.json({ ok: true, location });
  });

  router.use((error: unknown, _request: any, response: any, next: any) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        ok: false,
        message: 'Los datos enviados no son válidos.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
      return;
    }
    if (error instanceof AdminNotFoundError) {
      response.status(404).json({ ok: false, message: error.message });
      return;
    }
    if (error instanceof AdminConflictError) {
      response.status(409).json({ ok: false, message: error.message });
      return;
    }
    if (error instanceof AdminValidationError) {
      response.status(400).json({ ok: false, message: error.message });
      return;
    }
    next(error);
  });

  return router;
}

function textQuery(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanQuery(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AdminValidationError('El filtro active debe ser true o false.');
}
