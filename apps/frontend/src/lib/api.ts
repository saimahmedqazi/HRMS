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

let refreshInFlight: Promise<boolean> | undefined;
let sessionVersion = 0;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then((response) => {
      if (response.ok) sessionVersion += 1;
      else if (response.status !== 401) throw new ApiError(response.status, 'Unable to refresh the session.');
      return response.ok;
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
  const initialSessionVersion = sessionVersion;
  let response = await fetch(url, requestOptions);
  if (response.status === 401 && !isPublicAuthRoute) {
    const refreshed = initialSessionVersion !== sessionVersion || await refreshSession();
    if (refreshed) response = await fetch(url, requestOptions);
  }

  const json = await response.json().catch(() => null);

  if (isPublicAuthRoute && json === null) {
    throw new ApiError(response.status, 'The authentication service is unavailable. Please try again or contact your administrator.');
  }

  if (!response.ok) {
    const errorMessage = json?.message || `Request failed with status ${response.status}`;
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
