export const API_PREFIX = '/api/v1';

const publicAuthRoutes = new Set([
  '/auth/login',
  '/auth/login/2fa',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
]);

export type AuthSyncEvent =
  | { type: 'SESSION_EXPIRED' }
  | { type: 'LOGGED_OUT' }
  | { type: 'SESSION_REFRESHED'; seq: number };

const AUTH_CHANNEL_NAME = 'zenhr-auth-sync';
const REFRESH_SEQ_KEY = 'zenhr_auth_refresh_seq';
const REFRESH_LOCK_NAME = 'zenhr_auth_refresh';

let refreshInFlight: Promise<boolean> | undefined;
let sessionVersion = 0;
const authListeners = new Set<(event: AuthSyncEvent) => void>();
let authChannel: BroadcastChannel | null = null;

function readRefreshSeq(): number {
  if (typeof window === 'undefined') return sessionVersion;
  try {
    const raw = window.localStorage.getItem(REFRESH_SEQ_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? Math.max(parsed, sessionVersion) : sessionVersion;
  } catch {
    return sessionVersion;
  }
}

function writeRefreshSeq(next: number): void {
  sessionVersion = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REFRESH_SEQ_KEY, String(next));
  } catch {
    // Ignore storage quota / private mode restrictions.
  }
}

function getAuthChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!authChannel) {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    authChannel.onmessage = (event: MessageEvent<AuthSyncEvent>) => {
      const payload = event.data;
      if (!payload || typeof payload.type !== 'string') return;
      if (payload.type === 'SESSION_REFRESHED' && typeof payload.seq === 'number') {
        sessionVersion = Math.max(sessionVersion, payload.seq);
      }
      for (const listener of authListeners) listener(payload);
    };
  }
  return authChannel;
}

export function subscribeAuthSync(listener: (event: AuthSyncEvent) => void): () => void {
  authListeners.add(listener);
  getAuthChannel();
  return () => {
    authListeners.delete(listener);
  };
}

export function broadcastAuthEvent(event: AuthSyncEvent): void {
  for (const listener of authListeners) listener(event);
  try {
    getAuthChannel()?.postMessage(event);
  } catch {
    // Ignore channel errors on closing tabs.
  }
}

async function runWithCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      return await navigator.locks.request(
        REFRESH_LOCK_NAME,
        { mode: 'exclusive', signal: controller.signal },
        fn,
      );
    } catch {
      // If lock wait aborted (e.g. hung tab), fall back directly.
      return fn();
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return fn();
}

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    const seqBeforeWait = readRefreshSeq();
    refreshInFlight = runWithCrossTabLock(async () => {
      // Another tab completed refresh while we waited for the lock.
      if (readRefreshSeq() > seqBeforeWait) {
        return true;
      }

      let response: Response;
      try {
        response = await fetch(`${API_PREFIX}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        throw new ApiError(0, 'Unable to reach the server to refresh your session.');
      }

      if (response.ok) {
        const nextSeq = readRefreshSeq() + 1;
        writeRefreshSeq(nextSeq);
        broadcastAuthEvent({ type: 'SESSION_REFRESHED', seq: nextSeq });
        return true;
      }

      if (response.status === 401) {
        broadcastAuthEvent({ type: 'SESSION_EXPIRED' });
        return false;
      }

      throw new ApiError(
        response.status,
        'Unable to verify your session right now. Please try again.',
      );
    }).finally(() => {
      refreshInFlight = undefined;
    });
  }
  return refreshInFlight;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_PREFIX}${path}`;
  const isPublicAuthRoute = publicAuthRoutes.has(path.split('?')[0]);

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (!isFormData) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const requestOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
    credentials: 'include', // Automatically send and receive httpOnly cookies
  };

  const initialSeq = readRefreshSeq();
  let response = await fetch(url, requestOptions);
  if (response.status === 401 && !isPublicAuthRoute) {
    const refreshed = readRefreshSeq() !== initialSeq || (await refreshSession());
    if (refreshed) {
      response = await fetch(url, requestOptions);
      if (response.status === 401) {
        broadcastAuthEvent({ type: 'SESSION_EXPIRED' });
      }
    }
  }

  const json = await response.json().catch(() => null);

  if (isPublicAuthRoute && json === null) {
    throw new ApiError(response.status, 'The authentication service is unavailable. Please try again or contact your administrator.');
  }

  if (!response.ok) {
    const validationMessages = Array.isArray(json?.errors)
      ? json.errors.flatMap((error: unknown) => {
          if (typeof error === 'string') return [error];
          if (!error || typeof error !== 'object') return [];
          const item = error as { property?: unknown; constraints?: unknown };
          const constraints = item.constraints && typeof item.constraints === 'object'
            ? Object.values(item.constraints).filter((value): value is string => typeof value === 'string')
            : [];
          return constraints.map((message) => `${typeof item.property === 'string' ? `${item.property}: ` : ''}${message}`);
        })
      : [];
    const errorMessage = validationMessages.length
      ? validationMessages.join('; ')
      : json?.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, errorMessage, json);
  }

  // Backend wraps payload in { success, data, message, timestamp }
  return (json?.data !== undefined ? json.data : json) as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    });
  },

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    });
  },

  delete: <T>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
