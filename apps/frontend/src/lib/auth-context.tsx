'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

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
  lastLoginAt?: string;
  lastLoginLocation?: string;
  companyId?: string | null;
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
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  allowedModules: [],
  isLoading: true,
  isAuthenticated: false,
  logout: async () => {},
  refetchUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading: userLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<UserProfile>('/auth/me'),
    retry: false,
  });

  const { data: moduleData } = useQuery({
    queryKey: ['auth', 'modules'],
    queryFn: () => api.get<{ role: UserRole; allowedModules: string[] }>('/auth/me/modules'),
    enabled: !!user,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.setQueryData(['auth', 'modules'], null);
      window.location.href = '/login';
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
        refetchUser: () => {
          refetchUser();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
