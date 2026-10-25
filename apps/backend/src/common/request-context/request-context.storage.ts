import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  userId: string | null;
  companyId: string | null;
  role: string | null;
  supportModeCompanyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextData>();
