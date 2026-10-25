'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Users,
  Search,
  Plus,
  Filter,
  ArrowRight,
  Mail,
  Phone,
  Building,
  CheckCircle,
} from 'lucide-react';

interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status: string;
  profilePictureUrl?: string;
  department?: { id: string; name: string };
  designation?: { id: string; name: string };
  team?: { id: string; name: string };
  reportingManager?: { id: string; firstName: string; lastName: string };
  user?: { id: string; email: string; role: string };
}

interface EmployeesResponse {
  items: EmployeeItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);

  // Onboarding Modal
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    employeeCode: string;
    email: string;
    tempPassword?: string;
  } | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');

  // Fetch departments for dropdown
  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<any[]>('/departments'),
  });

  const { data: desigData } = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get<any[]>('/designations'),
  });

  // Fetch employees list
  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, statusFilter, deptFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (deptFilter) params.append('departmentId', deptFilter);
      params.append('page', String(page));
      params.append('limit', '12');
      return api.get<EmployeesResponse>(`/employees?${params.toString()}`);
    },
  });

  // Onboard mutation
  const onboardMutation = useMutation({
    mutationFn: () =>
      api.post('/employees', {
        firstName,
        lastName,
        email,
        role,
        departmentId: departmentId || undefined,
        designationId: designationId || undefined,
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setCreatedCredentials(res);
      setFirstName('');
      setLastName('');
      setEmail('');
    },
  });

  const employees: EmployeeItem[] = data?.items || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Employee Directory
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {meta ? `${meta.total} total workforce records` : 'Workforce directory'}
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedCredentials(null);
            setShowOnboardModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" /> Onboard Employee
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, employee code, or email..."
            className="w-full rounded-lg border border-zinc-300 pl-9 pr-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All Departments</option>
            {(deptData || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_PROBATION">On probation</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="RESIGNED">Resigned</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {/* Employee Cards Grid */}
      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading employees...</p>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <Users className="mx-auto h-10 w-10 text-zinc-400" />
          <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No employees found
          </p>
          <p className="text-xs text-zinc-500">
            Try adjusting your search filters or click "Onboard Employee" to add one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <Link
              key={emp.id}
              href={`/dashboard/employees/${emp.id}`}
              className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {emp.profilePictureUrl ? (
                    <img
                      src={emp.profilePictureUrl}
                      alt={`${emp.firstName} ${emp.lastName}`}
                      className="h-12 w-12 rounded-full object-cover ring-2 ring-zinc-100 dark:ring-zinc-800"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {emp.firstName.charAt(0)}
                      {emp.lastName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
                      {emp.firstName} {emp.lastName}
                    </h3>
                    <p className="text-xs text-zinc-500">{emp.employeeCode}</p>
                  </div>
                </div>
                <StatusBadge status={emp.status} />
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-zinc-400" />
                  <span>
                    {emp.department?.name || 'No Dept'} • {emp.designation?.name || 'No Title'}
                  </span>
                </div>
                {emp.user?.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="truncate">{emp.user.email}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                <span>
                  {emp.reportingManager
                    ? `Reports to ${emp.reportingManager.firstName} ${emp.reportingManager.lastName}`
                    : 'Direct CEO report'}
                </span>
                <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                  Profile <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            Page {meta.page} of {meta.totalPages} ({meta.total} records)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Previous
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Onboard Employee Modal */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            {createdCredentials ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Employee Successfully Onboarded!
                </h2>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left text-xs dark:border-zinc-800 dark:bg-zinc-800/50">
                  <p className="mb-1 text-zinc-500">Share these initial credentials with the employee:</p>
                  <p><strong>Employee Code:</strong> {createdCredentials.employeeCode}</p>
                  <p><strong>Email:</strong> {createdCredentials.email}</p>
                  <p><strong>Temporary Password:</strong> <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">{createdCredentials.tempPassword}</code></p>
                </div>
                <button
                  onClick={() => setShowOnboardModal(false)}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Onboard New Employee
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane.doe@acme.com"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Department
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <option value="">Select Department</option>
                      {(deptData || []).map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Designation
                    </label>
                    <select
                      value={designationId}
                      onChange={(e) => setDesignationId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <option value="">Select Designation</option>
                      {(desigData || []).map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      System Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <option value="EMPLOYEE">Employee</option>
                      <option value="TEAM_LEAD">Team Lead</option>
                      <option value="DEPARTMENT_MANAGER">Department Manager</option>
                      <option value="HR_MANAGER">HR Manager</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setShowOnboardModal(false)}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!firstName.trim() || !lastName.trim() || !email.trim() || onboardMutation.isPending}
                    onClick={() => onboardMutation.mutate()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {onboardMutation.isPending ? 'Onboarding...' : 'Complete Onboarding'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
