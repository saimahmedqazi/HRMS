'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Building2, Users, Plus, Shield, FolderPlus, Tag } from 'lucide-react';

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

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'departments' | 'designations' | 'teams'>('departments');

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
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'departments'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Departments ({departments.length})
          </button>
          <button
            onClick={() => setActiveTab('designations')}
            className={`flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'designations'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            <Tag className="h-4 w-4" />
            Designations ({designations.length})
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium ${
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
              <div
                key={dept.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {dept.name}
                      </h3>
                      <p className="text-xs text-zinc-500 line-clamp-1">
                        {dept.description || 'No description provided'}
                      </p>
                    </div>
                  </div>
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
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Designations */}
      {activeTab === 'designations' && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
              <div
                key={team.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                    <FolderPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{team.name}</h3>
                    <p className="text-xs text-zinc-500">{team.department?.name}</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                  <span>{team._count.employees} Member{team._count.employees === 1 ? '' : 's'}</span>
                </div>
              </div>
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
    </div>
  );
}
