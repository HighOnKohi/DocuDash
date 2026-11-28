import { Linking, Platform } from 'react-native';

import type {
  ApiErrorResponse,
  Barangay,
  BarangayAdminRequestPayload,
  BarangayAdminRequestResponse,
  BarangayUpdate,
  Profile,
} from '@/types/database';

import { appendAuditLog } from './auditService';
import {
  buildAttachmentPath,
  MAX_ATTACHMENT_BYTES,
  type UploadableFileBody,
} from './storageService';
import {
  getApiBaseUrl,
  getSupabaseClient,
  requireAuthenticatedUserId,
  ServiceError,
  toServiceError,
} from './supabase';

export const BARANGAY_ASSETS_BUCKET = 'barangay-assets';

const ALLOWED_QR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedQrMimeType = (typeof ALLOWED_QR_MIME_TYPES)[number];

function isAllowedQrMime(value: string): value is AllowedQrMimeType {
  return (ALLOWED_QR_MIME_TYPES as readonly string[]).includes(value);
}

function getFileSizeBytes(file: UploadableFileBody): number {
  if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
    return file.byteLength;
  }
  return file.size;
}

export async function getBarangayById(barangayId: string): Promise<Barangay | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('barangays')
    .select('*')
    .eq('id', barangayId)
    .maybeSingle();

  if (error) {
    throw toServiceError(error, 'Unable to load barangay information.');
  }

  return data;
}

export async function listBarangays(): Promise<Barangay[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('barangays')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw toServiceError(error, 'Unable to load barangay directory.');
  }

  return data ?? [];
}

/**
 * Resolves (or creates) the Philippine barangay record and binds the current
 * user's profile to it (`assign_my_barangay` RPC).
 */
export async function assignMyBarangay(input: {
  barangayCode?: string | null;
  barangayName: string;
  cityMunicipality: string;
  province?: string;
  region?: string;
}): Promise<Profile> {
  const name = input.barangayName.trim();
  const city = input.cityMunicipality.trim();
  if (name.length < 2 || city.length < 2) {
    throw new ServiceError('Please select a valid Philippine barangay and city/municipality.', {
      code: 'invalid_barangay',
    });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('assign_my_barangay', {
    p_barangay_code: input.barangayCode?.trim() || null,
    p_barangay_name: name,
    p_city_municipality: city,
    p_province: input.province?.trim() ?? '',
    p_region: input.region?.trim() ?? '',
  });

  if (error || !data) {
    throw toServiceError(error, 'Unable to assign your barangay.');
  }

  return data;
}

/** Updates a barangay office's hall address/coordinates or GCash account details. */
export async function updateBarangayOffice(
  barangayId: string,
  updates: BarangayUpdate
): Promise<Barangay> {
  const payload: BarangayUpdate = {};

  if (updates.hall_address !== undefined) {
    payload.hall_address = updates.hall_address.trim();
  }
  if (updates.google_maps_url !== undefined) {
    const trimmed = updates.google_maps_url?.trim() || null;
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      throw new ServiceError('Google Maps link must start with https:// or http://.', {
        code: 'invalid_maps_url',
      });
    }
    payload.google_maps_url = trimmed;
  }
  if (updates.hall_latitude !== undefined) {
    if (
      updates.hall_latitude !== null &&
      (!Number.isFinite(updates.hall_latitude) ||
        updates.hall_latitude < -90 ||
        updates.hall_latitude > 90)
    ) {
      throw new ServiceError('Latitude must be between -90 and 90.', {
        code: 'invalid_coordinates',
      });
    }
    payload.hall_latitude = updates.hall_latitude;
  }
  if (updates.hall_longitude !== undefined) {
    if (
      updates.hall_longitude !== null &&
      (!Number.isFinite(updates.hall_longitude) ||
        updates.hall_longitude < -180 ||
        updates.hall_longitude > 180)
    ) {
      throw new ServiceError('Longitude must be between -180 and 180.', {
        code: 'invalid_coordinates',
      });
    }
    payload.hall_longitude = updates.hall_longitude;
  }
  if (updates.gcash_account_name !== undefined) {
    payload.gcash_account_name = updates.gcash_account_name?.trim() || null;
  }
  if (updates.gcash_account_number !== undefined) {
    payload.gcash_account_number = updates.gcash_account_number?.trim() || null;
  }
  if (updates.gcash_qr_storage_path !== undefined) {
    payload.gcash_qr_storage_path = updates.gcash_qr_storage_path;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('barangays')
    .update(payload)
    .eq('id', barangayId)
    .select('*')
    .single();

  if (error || !data) {
    throw toServiceError(error, 'Unable to update barangay office settings.');
  }

  try {
    await appendAuditLog({
      action: 'barangay_updated',
      metadata: {
        barangay_id: barangayId,
        fields: Object.keys(payload),
      },
    });
  } catch {
    // Do not block office saves if audit log fails.
  }

  return data;
}

/** Resolves the public download URL for a staff-uploaded GCash QR image. */
export function getBarangayGcashQrUrl(storagePath: string | null | undefined): string | null {
  const trimmed = storagePath?.trim();
  if (!trimmed) return null;

  try {
    const supabase = getSupabaseClient();
    const { data } = supabase.storage.from(BARANGAY_ASSETS_BUCKET).getPublicUrl(trimmed);
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}

function buildQrDownloadFileName(storagePath: string, barangayName?: string | null): string {
  const extMatch = /\.(png|jpe?g|webp)$/i.exec(storagePath.trim());
  const ext = extMatch ? extMatch[1]!.toLowerCase() : 'png';
  const slug = (barangayName ?? 'barangay')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'barangay'}-gcash-qr.${ext}`;
}

/** Resolves a Supabase public URL with a `download` disposition filename. */
export function getBarangayGcashQrDownloadUrl(
  storagePath: string | null | undefined,
  fileName?: string
): string | null {
  const trimmed = storagePath?.trim();
  if (!trimmed) return null;

  try {
    const supabase = getSupabaseClient();
    const { data } = supabase.storage.from(BARANGAY_ASSETS_BUCKET).getPublicUrl(trimmed, {
      download: fileName || true,
    });
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Downloads the barangay's GCash QR image directly on Web (Blob download) or via
 * the device's system Download Manager / browser on Android and iOS.
 */
export async function downloadBarangayGcashQr(input: {
  storagePath: string;
  barangayName?: string | null;
}): Promise<void> {
  const fileName = buildQrDownloadFileName(input.storagePath, input.barangayName);
  const publicUrl = getBarangayGcashQrUrl(input.storagePath);
  const downloadUrl = getBarangayGcashQrDownloadUrl(input.storagePath, fileName) ?? publicUrl;

  if (!downloadUrl) {
    throw new ServiceError('GCash QR download link is unavailable.', {
      code: 'missing_qr_url',
    });
  }

  if (Platform.OS === 'web' && typeof document !== 'undefined' && publicUrl) {
    try {
      const response = await fetch(publicUrl);
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        return;
      }
    } catch {
      // Fall back to direct URL download below.
    }
  }

  await Linking.openURL(downloadUrl);
}

/**
 * Uploads or replaces the barangay's GCash QR image inside the `barangay-assets`
 * bucket (staff/admin only) and persists `gcash_qr_storage_path`.
 */
export async function uploadBarangayGcashQr(input: {
  barangayId: string;
  file: UploadableFileBody;
  fileName: string;
  contentType: string;
}): Promise<Barangay> {
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedQrMime(contentType)) {
    throw new ServiceError('Only JPEG, PNG, or WebP images are supported for GCash QR codes.', {
      code: 'unsupported_file_type',
    });
  }

  const byteLength = getFileSizeBytes(input.file);
  if (byteLength <= 0) {
    throw new ServiceError('Selected QR image is empty.', { code: 'empty_file' });
  }
  if (byteLength > MAX_ATTACHMENT_BYTES) {
    throw new ServiceError('QR image exceeds the 5 MB upload limit.', {
      code: 'file_too_large',
    });
  }

  await requireAuthenticatedUserId();
  const existing = await getBarangayById(input.barangayId);
  const oldPath = existing?.gcash_qr_storage_path ?? null;

  const syntheticPath = buildAttachmentPath(
    input.barangayId,
    input.barangayId,
    `gcash-qr-${input.fileName}`,
    contentType
  );
  const objectName = syntheticPath.split('/').pop() ?? `gcash-qr-${Date.now()}.png`;
  const storagePath = `${input.barangayId}/${objectName}`;

  const supabase = getSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(BARANGAY_ASSETS_BUCKET)
    .upload(storagePath, input.file, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw toServiceError(uploadError, 'Unable to upload GCash QR image.');
  }

  const updated = await updateBarangayOffice(input.barangayId, {
    gcash_qr_storage_path: storagePath,
  });

  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(BARANGAY_ASSETS_BUCKET).remove([oldPath]).catch(() => {});
  }

  return updated;
}

export type BarangayLocationTarget = {
  name?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  hall_address?: string | null;
  hall_latitude?: number | null;
  hall_longitude?: number | null;
  google_maps_url?: string | null;
};

/**
 * Builds the best Google Maps URL for locating the assigned Barangay Hall
 * (saved Google Maps link -> exact coordinates -> Google Maps place search).
 */
export function buildBarangayHallMapsUrl(barangay: BarangayLocationTarget): string {
  const customUrl = barangay.google_maps_url?.trim();
  if (customUrl && /^https?:\/\//i.test(customUrl)) {
    return customUrl;
  }

  if (
    typeof barangay.hall_latitude === 'number' &&
    typeof barangay.hall_longitude === 'number' &&
    Number.isFinite(barangay.hall_latitude) &&
    Number.isFinite(barangay.hall_longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${barangay.hall_latitude},${barangay.hall_longitude}`;
  }

  const namePart = barangay.name?.trim()
    ? /^barangay/i.test(barangay.name.trim())
      ? `${barangay.name.trim()} Hall`
      : `Barangay ${barangay.name.trim()} Hall`
    : 'Barangay Hall';

  const queryParts = [
    barangay.hall_address?.trim() || namePart,
    barangay.hall_address?.trim() ? namePart : null,
    barangay.city_municipality?.trim(),
    barangay.province?.trim(),
    'Philippines',
  ].filter(Boolean);

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(', '))}`;
}

export async function openBarangayHallInMaps(barangay: BarangayLocationTarget): Promise<void> {
  const url = buildBarangayHallMapsUrl(barangay);
  await Linking.openURL(url);
}

/**
 * Submits a public Barangay Admin onboarding request to Vercel
 * `POST /api/request-barangay-admin`, which emails `docudash.app@gmail.com`.
 */
export async function submitBarangayAdminRequest(
  payload: BarangayAdminRequestPayload
): Promise<BarangayAdminRequestResponse> {
  const url = `${getApiBaseUrl()}/api/request-barangay-admin`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new ServiceError('Unable to reach the DocuDash server. Check your connection.', {
      code: 'network_error',
      cause: networkError,
    });
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON response body handled below.
  }

  if (!response.ok) {
    const apiError = parsed as Partial<ApiErrorResponse> | null;
    throw new ServiceError(
      apiError?.error ?? `Unable to submit request (status ${response.status}).`,
      {
        code: apiError?.code ?? 'api_error',
        status: response.status,
      }
    );
  }

  return parsed as BarangayAdminRequestResponse;
}
