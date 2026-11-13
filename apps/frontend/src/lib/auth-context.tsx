'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'OPERATION_MANAGER'
  | 'COMPANY_ADMIN'
  | 'HR_MANAGER'
  | 'DEPARTMENT_MANAGER'
  | 'TEAM_LEAD'
  | 'EMPLOYEE';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  lastLoginCity?: string | null;
  lastLoginCountry?: string | null;
  lastLoginLatitude?: number | null;
  lastLoginLongitude?: number | null;
  lastLoginUserAgent?: string | null;
  lastLoginLocation?: string | null;
  twoFaEnabled?: boolean;
  dataScope?: string;
  companyId?: string | null;
  supportModeCompanyId?: string | null;
  supportModeCompany?: {
    id: string;
    name: string;
    logoUrl?: string;
    subscriptionTier: 'BASIC' | 'PREMIUM';
    status: string;
  } | null;
  company?: {
    id: string;
    name: string;
    logoUrl?: string;
    subscriptionTier: 'BASIC' | 'PREMIUM';
    status: string;
  };
  employee?: {
    id: string;
    employeeNumber: string;
    hireDate: string;
    status: string;
    locationConsent: boolean;
    department?: { id: string; name: string };
    designation?: { id: string; title: string };
    team?: { id: string; name: string };
  };
}

interface AuthContextType {
  user: UserProfile | null;
  allowedModules: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  allowedModules: [],
  isLoading: true,
  isAuthenticated: false,
  logout: async () => {},
  refetchUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const {
    data: cachedUser,
    error: sessionError,
    isLoading: userLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: ({ signal }) => api.get<UserProfile>('/auth/me', { signal }),
    retry: false,
  });
  const user = sessionError instanceof ApiError && sessionError.status === 401 ? null : cachedUser;

  const { data: moduleData } = useQuery({
    queryKey: ['auth', 'modules'],
    queryFn: () => api.get<{ role: UserRole; allowedModules: string[] }>('/auth/me/modules'),
    enabled: !!user,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ['auth'] });
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'modules'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        allowedModules: moduleData?.allowedModules || [],
        isLoading: userLoading,
        isAuthenticated: !!user,
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        refetchUser: async () => {
          await queryClient.cancelQueries({ queryKey: ['auth', 'me'], exact: true });
          await refetchUser();
          await queryClient.invalidateQueries({ queryKey: ['auth', 'modules'] });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
