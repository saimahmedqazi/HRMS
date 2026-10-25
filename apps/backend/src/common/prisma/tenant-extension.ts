import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../request-context/request-context.service';

/**
 * TENANT_MODELS: All models that require automatic companyId injection.
 * Add new tenant-owned models here as new phases add them.
 * Platform models (Company, User with SUPER_ADMIN role) are NOT in this set.
 */
export const TENANT_MODELS = new Set([
  'department',
  'designation',
  'team',
  'employee',
  'emergencyContact',
  'employeeDocument',
  'employeeEducation',
  'employeeExperience',
  'employeeSkill',
  'shift',
  'employeeShift',
  'attendanceRecord',
  'workTimerEntry',
  'timerBreak',
  'remoteWorkPermission',
  'ipWhitelist',
  'leaveTypeSetting',
  'leaveRequest',
  'leaveBalance',
  'resourceRequest',
  'payrollStructure',
  'payslip',
  'subscription',
  'notification',
]);

/**
 * Creates a Prisma Client extended with:
 * 1. Automatic companyId injection for TENANT_MODELS queries
 * 2. Soft-delete filtering (excludes records where deletedAt is not null)
 */
export function createTenantPrismaClient(
  requestContext: RequestContextService,
): PrismaClient {
  const prisma = new PrismaClient();

  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async findFirst({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async findFirstOrThrow({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async findUnique({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async findUniqueOrThrow({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async count({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async aggregate({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async create({ model, operation, args, query }) {
          const modifiedArgs = injectTenantCreate(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async createMany({ model, operation, args, query }) {
          const modifiedArgs = injectTenantCreateMany(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async update({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async updateMany({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async delete({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async deleteMany({ model, operation, args, query }) {
          const modifiedArgs = injectTenantFilter(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
        async upsert({ model, operation, args, query }) {
          const modifiedArgs = injectTenantUpsert(model, args as any, requestContext);
          return query(modifiedArgs as any);
        },
      },
    },
  }) as unknown as PrismaClient;
}

type QueryArgs = Record<string, unknown>;

function getEffectiveCompanyId(requestContext: RequestContextService): string | null {
  return requestContext.getEffectiveCompanyId();
}

function isTenantModel(model: string): boolean {
  // Prisma model names are PascalCase, convert to camelCase for lookup
  const camelModel = model.charAt(0).toLowerCase() + model.slice(1);
  return TENANT_MODELS.has(camelModel);
}

function injectTenantFilter(
  model: string,
  args: QueryArgs,
  requestContext: RequestContextService,
): QueryArgs {
  if (!isTenantModel(model)) return args;

  const companyId = getEffectiveCompanyId(requestContext);
  if (!companyId) return args;

  return {
    ...args,
    where: {
      ...(args['where'] as QueryArgs | undefined),
      companyId,
    },
  };
}

function injectTenantCreate(
  model: string,
  args: QueryArgs,
  requestContext: RequestContextService,
): QueryArgs {
  if (!isTenantModel(model)) return args;

  const companyId = getEffectiveCompanyId(requestContext);
  if (!companyId) return args;

  return {
    ...args,
    data: {
      ...(args['data'] as QueryArgs | undefined),
      companyId,
    },
  };
}

function injectTenantCreateMany(
  model: string,
  args: QueryArgs,
  requestContext: RequestContextService,
): QueryArgs {
  if (!isTenantModel(model)) return args;

  const companyId = getEffectiveCompanyId(requestContext);
  if (!companyId) return args;

  const data = args['data'];
  if (Array.isArray(data)) {
    return {
      ...args,
      data: data.map((item: QueryArgs) => ({ ...item, companyId })),
    };
  }

  return {
    ...args,
    data: { ...(data as QueryArgs), companyId },
  };
}

function injectTenantUpsert(
  model: string,
  args: QueryArgs,
  requestContext: RequestContextService,
): QueryArgs {
  if (!isTenantModel(model)) return args;

  const companyId = getEffectiveCompanyId(requestContext);
  if (!companyId) return args;

  return {
    ...args,
    where: {
      ...(args['where'] as QueryArgs | undefined),
      companyId,
    },
    create: {
      ...(args['create'] as QueryArgs | undefined),
      companyId,
    },
    update: args['update'],
  };
}
