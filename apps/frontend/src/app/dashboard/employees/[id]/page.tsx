'use client';

import React, { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE_URL } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  User,
  Building,
  Mail,
  Phone,
  Calendar,
  Shield,
  Upload,
  Plus,
  Trash2,
  FileText,
  Camera,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'documents' | 'orgchart'>('overview');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');

  // Emergency contact modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactRel, setContactRel] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Document upload state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('CONTRACT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch employee details
  const { data, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get<any>(`/employees/${id}`),
    enabled: !!id,
  });

  const emp = data;

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: () =>
      api.patch(`/employees/${id}/status`, {
        status: newStatus,
        reason: statusReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      setShowStatusModal(false);
      setStatusReason('');
    },
  });

  // Emergency contact mutation
  const addContactMutation = useMutation({
    mutationFn: () =>
      api.post(`/employees/${id}/emergency-contacts`, {
        name: contactName,
        relationship: contactRel,
        phone: contactPhone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      setShowContactModal(false);
      setContactName('');
      setContactRel('');
      setContactPhone('');
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.delete(`/employees/${id}/emergency-contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
    },
  });

  // Avatar upload handler
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch(`${API_BASE_URL}/api/v1/employees/${id}/avatar`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
    } catch (err) {
      console.error('Avatar upload failed', err);
    }
  };

  // Document upload handler
  const handleDocUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', docName || selectedFile.name);
    formData.append('type', docType);

    try {
      await fetch(`${API_BASE_URL}/api/v1/employees/${id}/documents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      setShowDocModal(false);
      setSelectedFile(null);
      setDocName('');
    } catch (err) {
      console.error('Document upload failed', err);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading employee profile...</p>;
  }

  if (!emp) {
    return <p className="text-sm text-zinc-500">Employee profile not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Header Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative group">
              {emp.profilePictureUrl ? (
                <img
                  src={emp.profilePictureUrl}
                  alt={`${emp.firstName} ${emp.lastName}`}
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-zinc-50 dark:ring-zinc-800"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {emp.firstName.charAt(0)}
                  {emp.lastName.charAt(0)}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow hover:bg-indigo-500"
                title="Change Avatar"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {emp.firstName} {emp.lastName}
                </h1>
                <StatusBadge status={emp.status} size="md" />
              </div>
              <p className="text-sm text-zinc-500">
                {emp.employeeCode} • {emp.designation?.name || 'No designation'} •{' '}
                {emp.department?.name || 'No department'}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                {emp.user?.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {emp.user.email}
                  </span>
                )}
                {emp.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {emp.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Hired{' '}
                  {new Date(emp.hireDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNewStatus(emp.status);
                setShowStatusModal(true);
              }}
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Update Status
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'overview'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Overview & Job
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'contacts'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Emergency Contacts ({emp.emergencyContacts?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'documents'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Documents ({emp.documents?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('orgchart')}
            className={`border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === 'orgchart'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Reporting Hierarchy
          </button>
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Job Details Card */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Job Details</h3>
            <dl className="mt-4 divide-y divide-zinc-100 text-xs dark:divide-zinc-800">
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Department</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{emp.department?.name || '—'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Designation</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{emp.designation?.name || '—'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Team</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{emp.team?.name || '—'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Reporting Line</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {emp.reportingManager
                    ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}`
                    : 'Company Admin (CEO)'}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Probation End Date</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {emp.probationEndDate ? new Date(emp.probationEndDate).toLocaleDateString() : 'N/A'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Personal Demographic Card */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Personal Demographics</h3>
            <dl className="mt-4 divide-y divide-zinc-100 text-xs dark:divide-zinc-800">
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Date of Birth</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '—'}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Gender</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{emp.gender || '—'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Nationality</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">{emp.nationality || '—'}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-zinc-500">Address</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {[emp.address, emp.city, emp.country].filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Tab: Emergency Contacts */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Emergency Contacts</h3>
            <button
              onClick={() => setShowContactModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" /> Add Contact
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(emp.emergencyContacts || []).length === 0 ? (
              <p className="text-xs text-zinc-500 col-span-full">No emergency contacts registered.</p>
            ) : (
              emp.emergencyContacts.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</h4>
                    <p className="text-xs text-zinc-500">{c.relationship}</p>
                    <p className="mt-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">{c.phone}</p>
                  </div>
                  <button
                    onClick={() => deleteContactMutation.mutate(c.id)}
                    className="text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Employee Documents</h3>
            <button
              onClick={() => setShowDocModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Upload className="h-3.5 w-3.5" /> Upload Document
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(emp.documents || []).length === 0 ? (
              <p className="text-xs text-zinc-500 col-span-full">No documents uploaded.</p>
            ) : (
              emp.documents.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{d.name}</h4>
                      <p className="text-xs text-zinc-500">
                        {d.type} • Uploaded {new Date(d.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    View
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Reporting Hierarchy */}
      {activeTab === 'orgchart' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Direct Reportees</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(emp.subordinates || []).length === 0 ? (
              <p className="text-xs text-zinc-500 col-span-full">No direct reportees assigned.</p>
            ) : (
              emp.subordinates.map((sub: any) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-200 text-xs font-bold text-indigo-800">
                      {sub.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {sub.firstName} {sub.lastName}
                      </p>
                      <p className="text-[11px] text-zinc-500">{sub.designation?.name || 'Employee'}</p>
                    </div>
                  </div>
                  <StatusBadge status={sub.status} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Update Employment Status
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ON_PROBATION">On probation</option>
                  <option value="SUSPENDED">Suspended (Locks account)</option>
                  <option value="ON_LEAVE">On leave</option>
                  <option value="RESIGNED">Resigned</option>
                  <option value="TERMINATED">Terminated (Locks account)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Reason for Status Change
                </label>
                <textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Completed probation review, voluntary resignation, etc."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowStatusModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {statusMutation.isPending ? 'Updating...' : 'Confirm Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Add Emergency Contact</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Full Name *</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Maria Gonzalez"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Relationship *</label>
                <input
                  type="text"
                  value={contactRel}
                  onChange={(e) => setContactRel(e.target.value)}
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Phone Number *</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1-555-0123"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowContactModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={!contactName.trim() || !contactRel.trim() || !contactPhone.trim() || addContactMutation.isPending}
                onClick={() => addContactMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {addContactMutation.isPending ? 'Saving...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Upload Document</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Document Title</label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. Employment Contract 2025"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="CONTRACT">Employment Contract</option>
                  <option value="ID_PROOF">ID Proof / Passport</option>
                  <option value="CERTIFICATION">Degree / Certification</option>
                  <option value="TAX_FORM">Tax Document</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">File (PDF or Image)</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full text-xs text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDocModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                disabled={!selectedFile}
                onClick={handleDocUpload}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Upload to Cloud Storage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
