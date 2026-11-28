import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import type {
  AppManagerActionPayload,
  AppManagerActionResponse,
  AppManagerDashboardResponse,
  Database,
  ManagerAuditEntry,
  ManagerBarangaySummary,
  ManagerOverviewMetrics,
  ManagerUserRecord,
  RequestStatus,
  UserRole,
} from '../types/database';
import {
  getConfiguredAppManagerEmail,
  isConfiguredAppManagerEmail,
  requireAppManager,
} from './_lib/auth';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  sendJson,
} from './_lib/http';
import { DEFAULT_RETENTION_DAYS, runRetentionPurge } from './_lib/retentionPurge';
import { sendBarangayAdminApprovalEmail } from './_lib/smtp';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES: readonly UserRole[] = ['resident', 'staff', 'admin'];
const REQUEST_STATUSES: readonly RequestStatus[] = [
  'pending',
  'reviewing',
  'ready',
  'completed',
  'rejected',
];

const REQUIREMENTS_BUCKET = 'requirements';
const STORAGE_REMOVE_BATCH_SIZE = 100;
const STORAGE_LIST_LIMIT = 1000;
const AUTH_PAGE_SIZE = 200;
const MAX_AUTH_PAGES = 5;

interface MinimalAuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  createdAt: string;
}

function assertUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new HttpError(400, 'invalid_id', `${fieldName} must be a valid UUID.`);
  }
  return value.trim();
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const TEMP_PWD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CONTACT_REGEX = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
const DEFAULT_PORTAL_URL = 'https://docu-dash-ph.vercel.app';

function generateTemporaryPassword(): string {
  const bytes = randomBytes(12);
  let chars = '';
  for (let i = 0; i < 12; i++) {
    chars += TEMP_PWD_CHARS[bytes[i]! % TEMP_PWD_CHARS.length];
  }
  return `DD-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

function sanitizeContactNumber(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (CONTACT_REGEX.test(trimmed)) {
    return trimmed;
  }
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return digitsOnly;
  }
  return '09000000000';
}

function resolvePortalUrl(req: VercelRequest): string {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (/^https?:\/\//i.test(originHeader)) {
    return originHeader.replace(/\/+$/, '');
  }
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
  return configured || DEFAULT_PORTAL_URL;
}

async function listAllAuthUsers(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
): Promise<MinimalAuthUser[]> {
  const collected: MinimalAuthUser[] = [];

  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) {
      throw new HttpError(500, 'auth_users_lookup_failed', 'Unable to list platform accounts.');
    }

    const batch = data?.users ?? [];
    for (const user of batch) {
      collected.push({
        id: user.id,
        email: user.email ?? null,
        emailConfirmed: Boolean(user.email_confirmed_at),
        createdAt: user.created_at,
      });
    }

    if (batch.length < AUTH_PAGE_SIZE) {
      break;
    }
  }

  return collected;
}

async function listUserBucketPaths(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string[]> {
  const paths: string[] = [];
  const { data: topEntries, error: listError } = await supabaseAdmin.storage
    .from(REQUIREMENTS_BUCKET)
    .list(userId, { limit: STORAGE_LIST_LIMIT });

  if (listError || !topEntries) {
    return paths;
  }

  for (const entry of topEntries) {
    if (!entry.name) continue;
    const entryPath = `${userId}/${entry.name}`;
    if (entry.id) {
      paths.push(entryPath);
    } else {
      const { data: nestedEntries } = await supabaseAdmin.storage
        .from(REQUIREMENTS_BUCKET)
        .list(entryPath, { limit: STORAGE_LIST_LIMIT });

      for (const nested of nestedEntries ?? []) {
        if (nested.name && nested.id) {
          paths.push(`${entryPath}/${nested.name}`);
        }
      }
    }
  }

  return paths;
}

async function purgeUserStorageFiles(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<{ deletedRequestsCount: number; deletedAttachmentsCount: number }> {
  const { data: residentRequests, error: requestsError } = await supabaseAdmin
    .from('requests')
    .select('id')
    .eq('resident_id', userId);

  if (requestsError) {
    throw new HttpError(500, 'request_lookup_failed', 'Unable to prepare user storage cleanup.');
  }

  const requestIds = (residentRequests ?? []).map((row) => row.id);
  const storagePaths = new Set<string>();

  if (requestIds.length > 0) {
    const { data: attachments, error: attachmentsError } = await supabaseAdmin
      .from('request_attachments')
      .select('storage_path')
      .in('request_id', requestIds);

    if (attachmentsError) {
      throw new HttpError(
        500,
        'attachment_lookup_failed',
        'Unable to prepare uploaded files for removal.'
      );
    }

    for (const row of attachments ?? []) {
      if (row.storage_path) {
        storagePaths.add(row.storage_path);
      }
    }
  }

  for (const bucketPath of await listUserBucketPaths(supabaseAdmin, userId)) {
    storagePaths.add(bucketPath);
  }

  const uniquePaths = Array.from(storagePaths);
  for (let offset = 0; offset < uniquePaths.length; offset += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = uniquePaths.slice(offset, offset + STORAGE_REMOVE_BATCH_SIZE);
    const { error: removeError } = await supabaseAdmin.storage
      .from(REQUIREMENTS_BUCKET)
      .remove(batch);

    if (removeError) {
      throw new HttpError(
        500,
        'storage_cleanup_failed',
        'Unable to erase uploaded user files prior to deletion.'
      );
    }
  }

  return {
    deletedRequestsCount: requestIds.length,
    deletedAttachmentsCount: uniquePaths.length,
  };
}

async function handleGetDashboard(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  managerUserId: string
): Promise<AppManagerDashboardResponse> {
  // RA 10173 Data Minimization:
  // - Profiles exclude `address` and `contact_number`.
  // - Barangays exclude `gcash_account_number` and `gcash_qr_storage_path` strings.
  // - Requests are queried via `head: true` aggregate counts only (zero row content).
  // - `request_attachments` and private Storage URLs are never read.
  const [
    authUsers,
    profilesResult,
    barangaysResult,
    adminRequestsResult,
    documentTypesResult,
    auditLogsResult,
    totalReqCountResult,
    ...statusCountResults
  ] = await Promise.all([
    listAllAuthUsers(supabaseAdmin),
    supabaseAdmin
      .from('profiles')
      .select(
        'id, full_name, role, barangay_id, barangay_name, city_municipality, created_at, privacy_consent_at'
      )
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('barangays')
      .select(
        'id, psgc_code, name, city_municipality, province, region, hall_address, google_maps_url, is_active, gcash_qr_storage_path, gcash_account_name, created_at'
      )
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('barangay_admin_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin.from('document_types').select('*').order('name', { ascending: true }),
    supabaseAdmin
      .from('audit_logs')
      .select('id, actor_id, action, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }),
    ...REQUEST_STATUSES.map((status) =>
      supabaseAdmin
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
    ),
  ]);

  if (profilesResult.error) {
    throw new HttpError(500, 'profiles_lookup_failed', 'Unable to load account directory.');
  }
  if (barangaysResult.error) {
    throw new HttpError(500, 'barangays_lookup_failed', 'Unable to load barangays directory.');
  }
  if (adminRequestsResult.error) {
    throw new HttpError(
      500,
      'admin_requests_lookup_failed',
      'Unable to load barangay admin requests.'
    );
  }
  if (documentTypesResult.error) {
    throw new HttpError(
      500,
      'document_types_lookup_failed',
      'Unable to load document types catalogue.'
    );
  }
  if (auditLogsResult.error) {
    throw new HttpError(500, 'audit_logs_lookup_failed', 'Unable to load system audit logs.');
  }

  const authById = new Map<string, MinimalAuthUser>();
  for (const authUser of authUsers) {
    authById.set(authUser.id, authUser);
  }

  const users: ManagerUserRecord[] = [];
  const seenIds = new Set<string>();

  for (const profile of profilesResult.data ?? []) {
    seenIds.add(profile.id);
    const authUser = authById.get(profile.id);
    users.push({
      id: profile.id,
      fullName: profile.full_name,
      email: authUser?.email ?? null,
      emailConfirmed: authUser?.emailConfirmed ?? false,
      role: profile.role,
      barangayId: profile.barangay_id,
      barangayName: profile.barangay_name,
      cityMunicipality: profile.city_municipality,
      createdAt: profile.created_at,
      privacyConsentAt: profile.privacy_consent_at,
      isSelf: profile.id === managerUserId || isConfiguredAppManagerEmail(authUser?.email),
    });
  }

  for (const authUser of authUsers) {
    if (seenIds.has(authUser.id)) continue;
    users.push({
      id: authUser.id,
      fullName: isConfiguredAppManagerEmail(authUser.email)
        ? 'DocuDash App Manager'
        : 'Account Pending Profile',
      email: authUser.email,
      emailConfirmed: authUser.emailConfirmed,
      role: isConfiguredAppManagerEmail(authUser.email) ? 'admin' : 'resident',
      barangayId: null,
      barangayName: null,
      cityMunicipality: null,
      createdAt: authUser.createdAt,
      privacyConsentAt: null,
      isSelf: authUser.id === managerUserId || isConfiguredAppManagerEmail(authUser.email),
    });
  }

  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const barangays: ManagerBarangaySummary[] = (barangaysResult.data ?? []).map((row) => ({
    id: row.id,
    psgcCode: row.psgc_code,
    name: row.name,
    cityMunicipality: row.city_municipality,
    province: row.province,
    region: row.region,
    hallAddress: row.hall_address,
    googleMapsUrl: row.google_maps_url,
    isActive: row.is_active,
    hasGcashQr: Boolean(row.gcash_qr_storage_path),
    gcashAccountName: row.gcash_account_name,
    createdAt: row.created_at,
  }));

  const adminRequests = adminRequestsResult.data ?? [];

  const auditLogs: ManagerAuditEntry[] = (auditLogsResult.data ?? []).map((entry) => ({
    id: entry.id,
    action: entry.action,
    createdAt: entry.created_at,
    hasActor: Boolean(entry.actor_id),
    metadata: entry.metadata ?? {},
  }));

  const countByStatus = (idx: number) => statusCountResults[idx]?.count ?? 0;

  let residentCount = 0;
  let staffCount = 0;
  let adminCount = 0;
  for (const user of users) {
    if (user.isSelf) continue;
    if (user.role === 'resident') residentCount += 1;
    else if (user.role === 'staff') staffCount += 1;
    else if (user.role === 'admin') adminCount += 1;
  }

  const metrics: ManagerOverviewMetrics = {
    totalUsers: users.length,
    residentCount,
    staffCount,
    adminCount,
    totalBarangays: barangays.length,
    activeBarangays: barangays.filter((b) => b.isActive).length,
    pendingAdminRequests: adminRequests.filter((r) => r.status === 'pending').length,
    requestCounts: {
      total: totalReqCountResult.count ?? 0,
      pending: countByStatus(0),
      reviewing: countByStatus(1),
      ready: countByStatus(2),
      completed: countByStatus(3),
      rejected: countByStatus(4),
    },
  };

  return {
    ok: true,
    managerEmail: getConfiguredAppManagerEmail(),
    generatedAt: new Date().toISOString(),
    metrics,
    users,
    adminRequests,
    barangays,
    documentTypes: documentTypesResult.data ?? [],
    auditLogs,
  };
}

async function handlePostAction(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  managerUserId: string,
  body: Record<string, unknown>,
  portalUrl: string
): Promise<AppManagerActionResponse> {
  const action = body.action as AppManagerActionPayload['action'] | undefined;

  switch (action) {
    case 'update_user_role': {
      const userId = assertUuid(body.userId, 'userId');
      const nextRole = body.role;
      if (typeof nextRole !== 'string' || !VALID_ROLES.includes(nextRole as UserRole)) {
        throw new HttpError(400, 'invalid_role', 'Role must be resident, staff, or admin.');
      }
      if (userId === managerUserId) {
        throw new HttpError(
          403,
          'cannot_modify_self',
          'The App Manager account role cannot be modified here.'
        );
      }

      const { data: target, error: targetError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle();

      if (targetError) {
        throw new HttpError(500, 'profile_lookup_failed', 'Unable to inspect target account.');
      }
      if (!target) {
        throw new HttpError(404, 'profile_not_found', 'Target user profile was not found.');
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ role: nextRole as UserRole })
        .eq('id', userId);

      if (updateError) {
        throw new HttpError(500, 'role_update_failed', 'Unable to update user role.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_role_updated',
        request_id: null,
        metadata: {
          previous_role: target.role,
          next_role: nextRole,
        },
      });

      return {
        ok: true,
        action: 'update_user_role',
        message: `Account role updated to ${nextRole}.`,
      };
    }

    case 'assign_user_barangay': {
      const userId = assertUuid(body.userId, 'userId');
      const rawBarangayId = body.barangayId;
      const barangayId =
        rawBarangayId === null || rawBarangayId === undefined || rawBarangayId === ''
          ? null
          : assertUuid(rawBarangayId, 'barangayId');

      if (userId === managerUserId) {
        throw new HttpError(
          403,
          'cannot_modify_self',
          'The App Manager account is platform-wide and is not assigned to a single barangay.'
        );
      }

      let updateFields: {
        barangay_id: string | null;
        barangay_code: string | null;
        barangay_name: string | null;
        city_municipality: string | null;
        province: string | null;
        region: string | null;
      };

      let label = 'Unassigned';
      if (barangayId) {
        const { data: brgy, error: brgyError } = await supabaseAdmin
          .from('barangays')
          .select('id, psgc_code, name, city_municipality, province, region')
          .eq('id', barangayId)
          .maybeSingle();

        if (brgyError) {
          throw new HttpError(500, 'barangay_lookup_failed', 'Unable to load target barangay.');
        }
        if (!brgy) {
          throw new HttpError(404, 'barangay_not_found', 'Selected barangay was not found.');
        }

        label = `${brgy.name}, ${brgy.city_municipality}`;
        updateFields = {
          barangay_id: brgy.id,
          barangay_code: brgy.psgc_code,
          barangay_name: brgy.name,
          city_municipality: brgy.city_municipality,
          province: brgy.province || null,
          region: brgy.region || null,
        };
      } else {
        updateFields = {
          barangay_id: null,
          barangay_code: null,
          barangay_name: null,
          city_municipality: null,
          province: null,
          region: null,
        };
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updateFields)
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (updateError) {
        throw new HttpError(
          500,
          'barangay_assign_failed',
          'Unable to update user barangay assignment.'
        );
      }
      if (!updated) {
        throw new HttpError(404, 'profile_not_found', 'Target user profile was not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_barangay_assigned',
        request_id: null,
        metadata: {
          assigned: Boolean(barangayId),
          barangay_id: barangayId,
        },
      });

      return {
        ok: true,
        action: 'assign_user_barangay',
        message: barangayId ? `Assigned account to ${label}.` : 'Cleared barangay assignment.',
      };
    }

    case 'delete_user': {
      const userId = assertUuid(body.userId, 'userId');
      if (body.confirmation !== 'DELETE') {
        throw new HttpError(
          400,
          'confirmation_required',
          'Confirmation must equal "DELETE" to permanently delete an account.'
        );
      }
      if (userId === managerUserId) {
        throw new HttpError(
          403,
          'cannot_delete_self',
          'The App Manager account cannot be deleted from this panel.'
        );
      }

      const { data: authLookup, error: authLookupError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (authLookupError || !authLookup.user) {
        throw new HttpError(404, 'user_not_found', 'Target user account was not found.');
      }
      if (isConfiguredAppManagerEmail(authLookup.user.email)) {
        throw new HttpError(
          403,
          'cannot_delete_manager',
          'The protected App Manager account cannot be deleted.'
        );
      }

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      const { deletedRequestsCount, deletedAttachmentsCount } = await purgeUserStorageFiles(
        supabaseAdmin,
        userId
      );

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_user_deleted',
        request_id: null,
        metadata: {
          role: targetProfile?.role ?? 'unknown',
          deleted_requests_count: deletedRequestsCount,
          deleted_attachments_count: deletedAttachmentsCount,
        },
      });

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) {
        throw new HttpError(500, 'user_delete_failed', 'Unable to delete the target account.');
      }

      return {
        ok: true,
        action: 'delete_user',
        message: 'Account and private uploaded requirement files were permanently deleted.',
        deletedRequestsCount,
        deletedAttachmentsCount,
      };
    }

    case 'review_admin_request': {
      const requestId = assertUuid(body.requestId, 'requestId');
      const decision = body.decision;
      if (decision !== 'approved' && decision !== 'rejected') {
        throw new HttpError(400, 'invalid_decision', 'Decision must be approved or rejected.');
      }

      const { data: reqRow, error: reqError } = await supabaseAdmin
        .from('barangay_admin_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (reqError) {
        throw new HttpError(500, 'request_lookup_failed', 'Unable to load onboarding request.');
      }
      if (!reqRow) {
        throw new HttpError(404, 'request_not_found', 'Barangay admin request was not found.');
      }

      const notes =
        typeof body.notes === 'string' && body.notes.trim().length > 0
          ? body.notes.trim().slice(0, 1000)
          : undefined;

      const { error: updateReqError } = await supabaseAdmin
        .from('barangay_admin_requests')
        .update({
          status: decision,
          ...(notes !== undefined ? { notes } : {}),
        })
        .eq('id', requestId);

      if (updateReqError) {
        throw new HttpError(
          500,
          'request_update_failed',
          'Unable to update barangay admin request status.'
        );
      }

      let promotedUser = false;
      let accountCreated = false;
      let emailedCredentials = false;
      let temporaryPasswordFallback: string | undefined;

      if (decision === 'approved') {
        let existingBarangay: {
          id: string;
          psgc_code: string | null;
          name: string;
          city_municipality: string;
          province: string;
          region: string;
          hall_address: string;
          google_maps_url: string | null;
        } | null = null;

        if (reqRow.psgc_code) {
          const { data } = await supabaseAdmin
            .from('barangays')
            .select(
              'id, psgc_code, name, city_municipality, province, region, hall_address, google_maps_url'
            )
            .eq('psgc_code', reqRow.psgc_code)
            .maybeSingle();
          existingBarangay = data;
        }

        if (!existingBarangay) {
          const { data } = await supabaseAdmin
            .from('barangays')
            .select(
              'id, psgc_code, name, city_municipality, province, region, hall_address, google_maps_url'
            )
            .ilike('name', escapeIlikeLiteral(reqRow.barangay_name.trim()))
            .ilike('city_municipality', escapeIlikeLiteral(reqRow.city_municipality.trim()))
            .maybeSingle();
          existingBarangay = data;
        }

        let resolvedBarangay = existingBarangay;

        if (resolvedBarangay) {
          const patch: Database['public']['Tables']['barangays']['Update'] = {
            is_active: true,
          };
          if (!resolvedBarangay.hall_address && reqRow.hall_address) {
            patch.hall_address = reqRow.hall_address;
          }
          if (!resolvedBarangay.google_maps_url && reqRow.google_maps_url) {
            patch.google_maps_url = reqRow.google_maps_url;
          }
          if (!resolvedBarangay.psgc_code && reqRow.psgc_code) {
            patch.psgc_code = reqRow.psgc_code;
          }
          const { error: patchError } = await supabaseAdmin
            .from('barangays')
            .update(patch)
            .eq('id', resolvedBarangay.id);
          if (patchError) {
            throw new HttpError(
              500,
              'barangay_update_failed',
              'Approved request, but failed to update the barangay directory record.'
            );
          }
        } else {
          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('barangays')
            .insert({
              psgc_code: reqRow.psgc_code,
              name: reqRow.barangay_name.trim(),
              city_municipality: reqRow.city_municipality.trim(),
              province: reqRow.province,
              region: reqRow.region,
              hall_address: reqRow.hall_address,
              google_maps_url: reqRow.google_maps_url,
              is_active: true,
            })
            .select(
              'id, psgc_code, name, city_municipality, province, region, hall_address, google_maps_url'
            )
            .single();

          if (insertError || !inserted) {
            throw new HttpError(
              500,
              'barangay_create_failed',
              'Approved request, but failed to register the barangay record.'
            );
          }
          resolvedBarangay = inserted;
        }

        if (body.promoteApplicant === true && resolvedBarangay) {
          const targetEmail = reqRow.applicant_email.trim().toLowerCase();
          if (!isConfiguredAppManagerEmail(targetEmail)) {
            const authUsers = await listAllAuthUsers(supabaseAdmin);
            const matchedAuth = authUsers.find(
              (u) => u.email?.trim().toLowerCase() === targetEmail
            );

            if (matchedAuth) {
              const { data: updatedProfile } = await supabaseAdmin
                .from('profiles')
                .update({
                  role: 'admin',
                  barangay_id: resolvedBarangay.id,
                  barangay_code: resolvedBarangay.psgc_code,
                  barangay_name: resolvedBarangay.name,
                  city_municipality: resolvedBarangay.city_municipality,
                  province: resolvedBarangay.province || null,
                  region: resolvedBarangay.region || null,
                })
                .eq('id', matchedAuth.id)
                .select('id')
                .maybeSingle();

              if (updatedProfile) {
                promotedUser = true;
                const emailRes = await sendBarangayAdminApprovalEmail({
                  to: targetEmail,
                  applicantName: reqRow.applicant_name.trim() || 'Barangay Administrator',
                  barangayName: resolvedBarangay.name,
                  cityMunicipality: resolvedBarangay.city_municipality,
                  province: resolvedBarangay.province,
                  portalUrl,
                  temporaryPassword: null,
                });
                emailedCredentials = emailRes.sent;
              }
            } else {
              const tempPassword = generateTemporaryPassword();
              const rawName = reqRow.applicant_name.trim();
              const safeName =
                rawName.length >= 2 ? rawName.slice(0, 120) : 'Barangay Administrator';
              const rawAddress = (reqRow.hall_address ?? '').trim();
              const fallbackAddress = `${resolvedBarangay.name}, ${resolvedBarangay.city_municipality}`;
              const safeAddress = (rawAddress.length >= 5 ? rawAddress : fallbackAddress).slice(
                0,
                300
              );
              const safeContact = sanitizeContactNumber(reqRow.contact_number);

              const { data: createdAuth, error: createError } =
                await supabaseAdmin.auth.admin.createUser({
                  email: targetEmail,
                  password: tempPassword,
                  email_confirm: true,
                  user_metadata: {
                    full_name: safeName,
                    address: safeAddress,
                    contact_number: safeContact,
                    privacy_consent_at: new Date().toISOString(),
                    must_change_password: true,
                    barangay_code: resolvedBarangay.psgc_code,
                    barangay_name: resolvedBarangay.name,
                    city_municipality: resolvedBarangay.city_municipality,
                    province: resolvedBarangay.province,
                    region: resolvedBarangay.region,
                  },
                });

              if (createError || !createdAuth?.user) {
                throw new HttpError(
                  500,
                  'admin_account_create_failed',
                  createError?.message ||
                    'Approved barangay record, but failed to provision the Barangay Admin account.'
                );
              }

              const { error: promoteNewError } = await supabaseAdmin
                .from('profiles')
                .update({
                  role: 'admin',
                  barangay_id: resolvedBarangay.id,
                  barangay_code: resolvedBarangay.psgc_code,
                  barangay_name: resolvedBarangay.name,
                  city_municipality: resolvedBarangay.city_municipality,
                  province: resolvedBarangay.province || null,
                  region: resolvedBarangay.region || null,
                })
                .eq('id', createdAuth.user.id);

              if (promoteNewError) {
                throw new HttpError(
                  500,
                  'admin_profile_promote_failed',
                  'Account created, but failed to promote its profile role to Barangay Admin.'
                );
              }

              accountCreated = true;
              promotedUser = true;

              const emailRes = await sendBarangayAdminApprovalEmail({
                to: targetEmail,
                applicantName: safeName,
                barangayName: resolvedBarangay.name,
                cityMunicipality: resolvedBarangay.city_municipality,
                province: resolvedBarangay.province,
                portalUrl,
                temporaryPassword: tempPassword,
              });
              emailedCredentials = emailRes.sent;
              if (!emailedCredentials) {
                temporaryPasswordFallback = tempPassword;
              }
            }
          }
        }
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_admin_request_updated',
        request_id: null,
        metadata: {
          request_id: requestId,
          decision,
          promoted_user: promotedUser,
          account_created: accountCreated,
          emailed_credentials: emailedCredentials,
        },
      });

      const message =
        decision === 'rejected'
          ? `Marked onboarding request for ${reqRow.barangay_name} as rejected.`
          : accountCreated
            ? emailedCredentials
              ? `Approved ${reqRow.barangay_name}, created the Barangay Admin account, and emailed temporary credentials to ${reqRow.applicant_email}.`
              : `Approved ${reqRow.barangay_name} and created the Barangay Admin account, but SMTP email failed. Copy the fallback password shown below.`
            : promotedUser
              ? emailedCredentials
                ? `Approved ${reqRow.barangay_name}, promoted ${reqRow.applicant_email} to admin, and sent confirmation email.`
                : `Approved ${reqRow.barangay_name} and promoted ${reqRow.applicant_email} to admin.`
              : `Approved onboarding request for ${reqRow.barangay_name}.`;

      return {
        ok: true,
        action: 'review_admin_request',
        promotedUser,
        accountCreated,
        emailedCredentials,
        ...(temporaryPasswordFallback ? { temporaryPasswordFallback } : {}),
        message,
      };
    }

    case 'toggle_barangay': {
      const barangayId = assertUuid(body.barangayId, 'barangayId');
      if (typeof body.isActive !== 'boolean') {
        throw new HttpError(400, 'invalid_is_active', 'isActive must be a boolean.');
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('barangays')
        .update({ is_active: body.isActive })
        .eq('id', barangayId)
        .select('id, name')
        .maybeSingle();

      if (updateError) {
        throw new HttpError(500, 'barangay_toggle_failed', 'Unable to update barangay status.');
      }
      if (!updated) {
        throw new HttpError(404, 'barangay_not_found', 'Barangay record was not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_barangay_toggled',
        request_id: null,
        metadata: {
          barangay_id: barangayId,
          is_active: body.isActive,
        },
      });

      return {
        ok: true,
        action: 'toggle_barangay',
        message: `${updated.name} is now ${body.isActive ? 'active' : 'inactive'}.`,
      };
    }

    case 'update_document_type': {
      const documentTypeId = assertUuid(body.documentTypeId, 'documentTypeId');
      const fee = body.fee;
      const isActive = body.isActive;
      const description =
        typeof body.description === 'string' ? body.description.trim().slice(0, 500) : undefined;

      if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0 || fee > 100000) {
        throw new HttpError(
          400,
          'invalid_fee',
          'Fee must be a non-negative number up to PHP 100,000.'
        );
      }
      if (typeof isActive !== 'boolean') {
        throw new HttpError(400, 'invalid_is_active', 'isActive must be a boolean.');
      }

      const roundedFee = Math.round(fee * 100) / 100;
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('document_types')
        .update({
          fee: roundedFee,
          is_active: isActive,
          ...(description !== undefined ? { description } : {}),
        })
        .eq('id', documentTypeId)
        .select('id, name')
        .maybeSingle();

      if (updateError) {
        throw new HttpError(
          500,
          'document_type_update_failed',
          'Unable to update document catalogue item.'
        );
      }
      if (!updated) {
        throw new HttpError(404, 'document_type_not_found', 'Document type was not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: managerUserId,
        action: 'manager_document_type_updated',
        request_id: null,
        metadata: {
          document_type_id: documentTypeId,
          fee: roundedFee,
          is_active: isActive,
        },
      });

      return {
        ok: true,
        action: 'update_document_type',
        message: `Updated ${updated.name} configuration.`,
      };
    }

    case 'run_retention_purge': {
      const dryRun = body.dryRun === false ? false : true;
      const retentionDays =
        typeof body.retentionDays === 'number' && Number.isInteger(body.retentionDays)
          ? body.retentionDays
          : DEFAULT_RETENTION_DAYS;

      const purgeResult = await runRetentionPurge({
        supabaseAdmin,
        dryRun,
        retentionDays,
        actorId: managerUserId,
        triggeredBy: 'app_manager',
      });

      const message = purgeResult.dryRun
        ? `Dry run complete: ${purgeResult.matchedCount} expired attachment(s) across ${purgeResult.affectedRequestCount} request(s) eligible for purge.`
        : `Purged ${purgeResult.purgedCount} expired attachment(s) across ${purgeResult.affectedRequestCount} request(s).`;

      return {
        ok: true,
        action: 'run_retention_purge',
        purgeResult,
        message,
      };
    }

    default:
      throw new HttpError(400, 'invalid_action', 'Unsupported App Manager action.');
  }
}

/**
 * GET / POST /api/app-manager
 *
 * Consolidated, strictly RA 10173–minimized App Manager control plane accessible
 * exclusively by the verified `docudash.app@gmail.com` account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['GET', 'POST', 'OPTIONS'])) {
    return;
  }

  try {
    const manager = await requireAppManager(req);
    const supabaseAdmin = getSupabaseAdmin();

    if (req.method === 'GET') {
      const dashboard = await handleGetDashboard(supabaseAdmin, manager.userId);
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === 'POST') {
      const body = parseJsonBody<Record<string, unknown>>(req);
      const result = await handlePostAction(
        supabaseAdmin,
        manager.userId,
        body,
        resolvePortalUrl(req)
      );
      sendJson(res, 200, result);
      return;
    }

    throw new HttpError(405, 'method_not_allowed', 'Only GET and POST requests are accepted.');
  } catch (error) {
    handleRouteError(res, error);
  }
}
