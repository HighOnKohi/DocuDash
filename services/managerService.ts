import type {
  AppManagerActionPayload,
  AppManagerActionResponse,
  AppManagerDashboardResponse,
  UserRole,
} from '@/types/database';

import { callApi, ServiceError } from './supabase';

/**
 * Fetches the strictly RA 10173–minimized App Manager dashboard snapshot
 * from Vercel `GET /api/app-manager`. Accessible only to `docudash.app@gmail.com`.
 */
export async function getManagerDashboard(): Promise<AppManagerDashboardResponse> {
  return callApi<AppManagerDashboardResponse>('/api/app-manager', { method: 'GET' });
}

export async function runManagerAction(
  payload: AppManagerActionPayload
): Promise<AppManagerActionResponse> {
  return callApi<AppManagerActionResponse>('/api/app-manager', {
    method: 'POST',
    body: payload,
  });
}

export async function updateManagerUserRole(
  userId: string,
  role: UserRole
): Promise<AppManagerActionResponse> {
  return runManagerAction({ action: 'update_user_role', userId, role });
}

export async function assignManagerUserBarangay(
  userId: string,
  barangayId: string | null
): Promise<AppManagerActionResponse> {
  return runManagerAction({ action: 'assign_user_barangay', userId, barangayId });
}

export async function deleteManagerUser(
  userId: string,
  confirmation: string
): Promise<AppManagerActionResponse> {
  if (confirmation.trim() !== 'DELETE') {
    throw new ServiceError('Type DELETE in uppercase to confirm permanent account removal.', {
      code: 'confirmation_required',
    });
  }
  return runManagerAction({ action: 'delete_user', userId, confirmation: 'DELETE' });
}

export async function reviewBarangayAdminRequest(input: {
  requestId: string;
  decision: 'approved' | 'rejected';
  promoteApplicant?: boolean;
  notes?: string;
}): Promise<AppManagerActionResponse> {
  return runManagerAction({
    action: 'review_admin_request',
    requestId: input.requestId,
    decision: input.decision,
    promoteApplicant: input.promoteApplicant,
    notes: input.notes,
  });
}

export async function toggleBarangayActive(
  barangayId: string,
  isActive: boolean
): Promise<AppManagerActionResponse> {
  return runManagerAction({ action: 'toggle_barangay', barangayId, isActive });
}

export async function updateDocumentTypeConfig(input: {
  documentTypeId: string;
  fee: number;
  isActive: boolean;
  description?: string;
}): Promise<AppManagerActionResponse> {
  if (!Number.isFinite(input.fee) || input.fee < 0 || input.fee > 100000) {
    throw new ServiceError('Fee must be between PHP 0 and PHP 100,000.', {
      code: 'invalid_fee',
    });
  }
  return runManagerAction({
    action: 'update_document_type',
    documentTypeId: input.documentTypeId,
    fee: input.fee,
    isActive: input.isActive,
    description: input.description,
  });
}

export async function runManagerRetentionPurge(options?: {
  dryRun?: boolean;
  retentionDays?: number;
}): Promise<AppManagerActionResponse> {
  return runManagerAction({
    action: 'run_retention_purge',
    dryRun: options?.dryRun ?? true,
    retentionDays: options?.retentionDays,
  });
}
