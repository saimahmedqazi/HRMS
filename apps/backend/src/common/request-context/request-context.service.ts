import { Injectable } from '@nestjs/common';
import { requestContextStorage, RequestContextData } from './request-context.storage';

@Injectable()
export class RequestContextService {
  get(): RequestContextData | undefined {
    return requestContextStorage.getStore();
  }

  getCompanyId(): string | null {
    return this.get()?.companyId ?? null;
  }

  getUserId(): string | null {
    return this.get()?.userId ?? null;
  }

  getRole(): string | null {
    return this.get()?.role ?? null;
  }

  getSupportModeCompanyId(): string | null {
    return this.get()?.supportModeCompanyId ?? null;
  }

  getEffectiveCompanyId(): string | null {
    // In support mode, use supportModeCompanyId for queries
    const supportCompanyId = this.getSupportModeCompanyId();
    if (supportCompanyId) return supportCompanyId;
    return this.getCompanyId();
  }

  getIpAddress(): string | null {
    return this.get()?.ipAddress ?? null;
  }

  run<T>(data: RequestContextData, fn: () => T): T {
    return requestContextStorage.run(data, fn);
  }
}
