'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Building2,
  Users,
  Plus,
  FolderPlus,
  Tag,
  X,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface Department {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  teams: { id: string; name: string }[];
  _count: { employees: number; teams: number };
}

interface Designation {
  id: string;
  name: string;
  description?: string;
  _count: { employees: number };
}

interface Team {
  id: string;
  name: string;
  description?: string;
  department: { id: string; name: string };
  _count: { employees: number };
}

interface OrgMember {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status?: string;
  profilePictureUrl?: string | null;
  designation?: { id: string; name: string } | null;
}

interface DepartmentDetail {
  id: string;
  name: string;
  description?: string | null;
  teams: { id: string; name: string; description?: string | null }[];
  employees: OrgMember[];
}

interface TeamDetail {
  id: string;
  name: string;
  description?: string | null;
  department?: { id: string; name: string } | null;
  employees: OrgMember[];
}

type SelectedOrgEntity =
  | { type: 'department'; id: string }
  | { type: 'team'; id: string }
  | null;

export default function DepartmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'departments' | 'designations' | 'teams'>('departments');
  const [selectedEntity, setSelectedEntity] = useState<SelectedOrgEntity>(null);

  const canViewEmploymentStatus = [
    'SUPER_ADMIN',
    'OPERATION_MANAGER',
    'COMPANY_ADMIN',
    'HR_MANAGER',
    'DEPARTMENT_MANAGER',
    'TEAM_LEAD',
  ].includes(user?.role || '');

  const canOpenEmployeeProfile = [
    'SUPER_ADMIN',
    'OPERATION_MANAGER',
    'COMPANY_ADMIN',
    'HR_MANAGER',
    'DEPARTMENT_MANAGER',
  ].includes(user?.role || '');

  // Modals state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showDesigModal, setShowDesigModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  // Form states
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [desigName, setDesigName] = useState('');
  const [desigDesc, setDesigDesc] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamDeptId, setTeamDeptId] = useState('');

  // Fetch queries
  const { data: departmentsData, isLoading: loadingDepts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  });

  const { data: designationsData, isLoading: loadingDesigs } = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get<Designation[]>('/designations'),
  });

  const { data: teamsData, isLoading: loadingTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<Team[]>('/teams'),
  });

  const departments: Department[] = departmentsData || [];
  const designations: Designation[] = designationsData || [];
  const teams: Team[] = teamsData || [];

  const departmentDetailQuery = useQuery({
    queryKey: ['department-detail', selectedEntity?.type === 'department' ? selectedEntity.id : null],
    queryFn: () => api.get<DepartmentDetail>(`/departments/${selectedEntity!.id}`),
    enabled: selectedEntity?.type === 'department',
  });

  const teamDetailQuery = useQuery({
    queryKey: ['team-detail', selectedEntity?.type === 'team' ? selectedEntity.id : null],
    queryFn: () => api.get<TeamDetail>(`/teams/${selectedEntity!.id}`),
    enabled: selectedEntity?.type === 'team',
  });

  // Mutations
  const createDeptMutation = useMutation({
    mutationFn: () =>
      api.post('/departments', { name: deptName, description: deptDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setShowDeptModal(false);
      setDeptName('');
      setDeptDesc('');
    },
  });

  const createDesigMutation = useMutation({
    mutationFn: () =>
      api.post('/designations', { name: desigName, description: desigDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      setShowDesigModal(false);
      setDesigName('');
      setDesigDesc('');
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: () =>
      api.post('/teams', {
        name: teamName,
        description: teamDesc,
        departmentId: teamDeptId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowTeamModal(false);
      setTeamName('');
      setTeamDesc('');
      setTeamDeptId('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Organization Structure
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Manage your company departments, designations, and working teams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'departments' && (
            <button
              onClick={() => setShowDeptModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> Add Department
            </button>
          )}
          {activeTab === 'designations' && (
            <button
              onClick={() => setShowDesigModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> Add Designation
            </button>
          )}
          {activeTab === 'teams' && (
            <button
              onClick={() => setShowTeamModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> Add Team
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <nav className="-mb-px flex min-w-max gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('departments')}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 py-3.5 px-1 text-sm font-medium ${
              activeTab === 'departments'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Departments ({departments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('designations')}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 py-3.5 px-1 text-sm font-medium ${
              activeTab === 'designations'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            <Tag className="h-4 w-4" />
            Designations ({designations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('teams')}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 py-3.5 px-1 text-sm font-medium ${
              activeTab === 'teams'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            <FolderPlus className="h-4 w-4" />
            Teams ({teams.length})
          </button>
        </nav>
      </div>

      {/* Tab: Departments */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingDepts ? (
            <p className="text-sm text-zinc-500">Loading departments...</p>
          ) : departments.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <Building2 className="mx-auto h-8 w-8 text-zinc-400" />
              <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No departments created yet
              </p>
              <p className="text-xs text-zinc-500">
                Add your first department to start structuring your workforce.
              </p>
            </div>
          ) : (
            departments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedEntity({ type: 'department', id: dept.id })}
                className="group w-full rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                        {dept.name}
                      </h3>
                      <p className="text-xs text-zinc-500 line-clamp-1">
                        {dept.description || 'No description provided'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {dept._count.employees} Employee{dept._count.employees === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderPlus className="h-3.5 w-3.5" />
                    {dept._count.teams} Team{dept._count.teams === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Tab: Designations */}
      {activeTab === 'designations' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50">
                <th className="py-3.5 pl-6 pr-3 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Designation Title
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Description
                </th>
                <th className="px-3 py-3.5 text-right text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Employees
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loadingDesigs ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-sm text-zinc-500">
                    Loading designations...
                  </td>
                </tr>
              ) : designations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-sm text-zinc-500">
                    No designations configured yet
                  </td>
                </tr>
              ) : (
                designations.map((desig) => (
                  <tr key={desig.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="py-4 pl-6 pr-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {desig.name}
                    </td>
                    <td className="px-3 py-4 text-sm text-zinc-500">
                      {desig.description || '—'}
                    </td>
                    <td className="px-3 py-4 text-right text-sm text-zinc-600 dark:text-zinc-400">
                      {desig._count.employees}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Teams */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingTeams ? (
            <p className="text-sm text-zinc-500">Loading teams...</p>
          ) : teams.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <FolderPlus className="mx-auto h-8 w-8 text-zinc-400" />
              <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No teams created yet
              </p>
            </div>
          ) : (
            teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedEntity({ type: 'team', id: team.id })}
                className="group w-full rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-purple-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-purple-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                      <FolderPlus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{team.name}</h3>
                      <p className="truncate text-xs text-zinc-500">{team.department?.name}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-purple-500" />
                </div>
                <div className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                  <span>{team._count.employees} Member{team._count.employees === 1 ? '' : 's'}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Add Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Add New Department</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Department Name *
                </label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Marketing"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <textarea
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Brief description of department scope"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDeptModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={!deptName.trim() || createDeptMutation.isPending}
                onClick={() => createDeptMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {createDeptMutation.isPending ? 'Saving...' : 'Create Department'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Designation Modal */}
      {showDesigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Add New Designation</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Designation Title *
                </label>
                <input
                  type="text"
                  value={desigName}
                  onChange={(e) => setDesigName(e.target.value)}
                  placeholder="e.g. Lead Product Designer"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <textarea
                  value={desigDesc}
                  onChange={(e) => setDesigDesc(e.target.value)}
                  placeholder="Job scope and responsibilities"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDesigModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={!desigName.trim() || createDesigMutation.isPending}
                onClick={() => createDesigMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {createDesigMutation.isPending ? 'Saving...' : 'Create Designation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Add New Team</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Department *
                </label>
                <select
                  value={teamDeptId}
                  onChange={(e) => setTeamDeptId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Growth Marketing"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowTeamModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={!teamName.trim() || !teamDeptId || createTeamMutation.isPending}
                onClick={() => createTeamMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {createTeamMutation.isPending ? 'Saving...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department / Team Detail Drawer */}
      {selectedEntity && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[1px]"
          onClick={() => setSelectedEntity(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              selectedEntity.type === 'department' ? 'Department details' : 'Team details'
            }
            className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    selectedEntity.type === 'department'
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400'
                      : 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400'
                  }`}
                >
                  {selectedEntity.type === 'department' ? (
                    <Building2 className="h-5 w-5" />
                  ) : (
                    <FolderPlus className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {selectedEntity.type === 'department' ? 'Department' : 'Team'}
                  </p>
                  <h2 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {selectedEntity.type === 'department'
                      ? departmentDetailQuery.data?.name || 'Loading...'
                      : teamDetailQuery.data?.name || 'Loading...'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setSelectedEntity(null)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {(selectedEntity.type === 'department'
                ? departmentDetailQuery.isLoading
                : teamDetailQuery.isLoading) && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                </div>
              )}

              {(selectedEntity.type === 'department'
                ? departmentDetailQuery.isError
                : teamDetailQuery.isError) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Unable to load details
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      selectedEntity.type === 'department'
                        ? departmentDetailQuery.refetch()
                        : teamDetailQuery.refetch()
                    }
                    className="mt-2 font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {selectedEntity.type === 'department' && departmentDetailQuery.data && (
                <>
                  {departmentDetailQuery.data.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {departmentDetailQuery.data.description}
                    </p>
                  )}

                  {/* Teams in Department */}
                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Teams ({departmentDetailQuery.data.teams.length})
                    </h3>
                    {departmentDetailQuery.data.teams.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                        No teams in this department yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {departmentDetailQuery.data.teams.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedEntity({ type: 'team', id: t.id })}
                            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 text-left text-sm transition hover:border-purple-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-purple-700"
                          >
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {t.name}
                            </span>
                            <ChevronRight className="h-4 w-4 text-zinc-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Employees in Department */}
                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Employees ({departmentDetailQuery.data.employees.length})
                    </h3>
                    {departmentDetailQuery.data.employees.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                        No employees assigned to this department yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {departmentDetailQuery.data.employees.map((m) => {
                          const initials = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
                          const content = (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="flex min-w-0 items-center gap-3">
                                {m.profilePictureUrl ? (
                                  <img
                                    src={m.profilePictureUrl}
                                    alt={`${m.firstName} ${m.lastName}`}
                                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    {initials || '?'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    {m.firstName} {m.lastName}
                                  </p>
                                  <p className="truncate text-xs text-zinc-500">
                                    {m.employeeCode}
                                    {m.designation?.name ? ` • ${m.designation.name}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {canViewEmploymentStatus && m.status && <StatusBadge status={m.status} />}
                                {canOpenEmployeeProfile && (
                                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                                )}
                              </div>
                            </div>
                          );

                          return canOpenEmployeeProfile ? (
                            <Link
                              key={m.id}
                              href={`/dashboard/employees/${m.id}`}
                              className="block rounded-lg transition hover:ring-1 hover:ring-indigo-400"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div key={m.id}>{content}</div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedEntity.type === 'team' && teamDetailQuery.data && (
                <>
                  {teamDetailQuery.data.department && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>Department:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedEntity({
                            type: 'department',
                            id: teamDetailQuery.data!.department!.id,
                          })
                        }
                        className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {teamDetailQuery.data.department.name}
                      </button>
                    </div>
                  )}

                  {teamDetailQuery.data.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {teamDetailQuery.data.description}
                    </p>
                  )}

                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Team Members ({teamDetailQuery.data.employees.length})
                    </h3>
                    {teamDetailQuery.data.employees.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                        No members assigned to this team yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {teamDetailQuery.data.employees.map((m) => {
                          const initials = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
                          const content = (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="flex min-w-0 items-center gap-3">
                                {m.profilePictureUrl ? (
                                  <img
                                    src={m.profilePictureUrl}
                                    alt={`${m.firstName} ${m.lastName}`}
                                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                    {initials || '?'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    {m.firstName} {m.lastName}
                                  </p>
                                  <p className="truncate text-xs text-zinc-500">
                                    {m.employeeCode}
                                    {m.designation?.name ? ` • ${m.designation.name}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {canViewEmploymentStatus && m.status && <StatusBadge status={m.status} />}
                                {canOpenEmployeeProfile && (
                                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                                )}
                              </div>
                            </div>
                          );

                          return canOpenEmployeeProfile ? (
                            <Link
                              key={m.id}
                              href={`/dashboard/employees/${m.id}`}
                              className="block rounded-lg transition hover:ring-1 hover:ring-purple-400"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div key={m.id}>{content}</div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
