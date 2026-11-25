import type { RequestAttachment } from '@/types/database';

import { appendAuditLog } from './auditService';
import {
  getSupabaseClient,
  requireAuthenticatedUserId,
  ServiceError,
  toServiceError,
} from './supabase';

export const REQUIREMENTS_BUCKET = 'requirements';

/** Maximum upload size (5 MiB), mirroring `004_storage.sql`. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types, mirroring `004_storage.sql`. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

/** Staff ID preview URLs always expire after 60 seconds (RA 10173). */
export const SIGNED_URL_TTL_SECONDS = 60;

export type UploadableFileBody = Blob | File | ArrayBuffer | Uint8Array;

export interface UploadRequirementInput {
  requestId: string;
  /** Must match a `key` in the document type's `required_docs` array. */
  docType: string;
  file: UploadableFileBody;
  fileName: string;
  contentType: string;
}

export interface SignedAttachmentUrl {
  signedUrl: string;
  expiresIn: number;
}

const MIME_TO_EXT: Record<AllowedAttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function isAllowedMimeType(value: string): value is AllowedAttachmentMimeType {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

function getFileByteLength(file: UploadableFileBody): number {
  if (file instanceof ArrayBuffer) {
    return file.byteLength;
  }
  if (file instanceof Uint8Array) {
    return file.byteLength;
  }
  return file.size;
}

function sanitizeFileName(rawName: string, fallbackExt: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? `file.${fallbackExt}`;
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/_+/g, '_');

  const safeBase = cleaned.length > 0 ? cleaned : `document.${fallbackExt}`;
  const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const maxBaseLength = 200 - uniquePrefix.length - 1;
  return `${uniquePrefix}-${safeBase.slice(-maxBaseLength)}`;
}

/**
 * Builds the strict `{user_id}/{request_id}/{filename}` path required by
 * `001_schema.sql` and `004_storage.sql`.
 */
export function buildAttachmentPath(
  userId: string,
  requestId: string,
  fileName: string,
  contentType: AllowedAttachmentMimeType
): string {
  const safeName = sanitizeFileName(fileName, MIME_TO_EXT[contentType]);
  return `${userId}/${requestId}/${safeName}`;
}

/**
 * Uploads a resident's requirement file to the private `requirements` bucket
 * using `upsert: false` (no Storage UPDATE policy exists) and registers the
 * metadata row in `public.request_attachments`.
 *
 * If the database insert fails, the uploaded storage object is deleted to avoid
 * orphaned files.
 */
export async function uploadRequirementAttachment(
  input: UploadRequirementInput
): Promise<RequestAttachment> {
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedMimeType(contentType)) {
    throw new ServiceError('Only JPEG, PNG, WebP images and PDF documents are accepted.', {
      code: 'unsupported_file_type',
    });
  }

  const byteLength = getFileByteLength(input.file);
  if (byteLength <= 0) {
    throw new ServiceError('Selected file is empty.', { code: 'empty_file' });
  }
  if (byteLength > MAX_ATTACHMENT_BYTES) {
    throw new ServiceError('File exceeds the 5 MB upload limit.', { code: 'file_too_large' });
  }

  const docType = input.docType.trim();
  if (!/^[a-z0-9_]{2,64}$/.test(docType)) {
    throw new ServiceError('Invalid requirement document type key.', { code: 'invalid_doc_type' });
  }

  const userId = await requireAuthenticatedUserId();
  const storagePath = buildAttachmentPath(userId, input.requestId, input.fileName, contentType);
  const supabase = getSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(REQUIREMENTS_BUCKET)
    .upload(storagePath, input.file, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw toServiceError(uploadError, 'Unable to upload requirement file.');
  }

  const { data: attachment, error: insertError } = await supabase
    .from('request_attachments')
    .insert({
      request_id: input.requestId,
      storage_path: storagePath,
      doc_type: docType,
    })
    .select('*')
    .single();

  if (insertError) {
    // Clean up the uploaded file so storage never holds unreferenced sensitive IDs.
    await supabase.storage.from(REQUIREMENTS_BUCKET).remove([storagePath]);
    throw toServiceError(insertError, 'Unable to save requirement attachment record.');
  }

  return attachment;
}

/**
 * Deletes an attachment from a resident's own pending request (metadata row
 * first, then the private storage object).
 */
export async function deleteRequirementAttachment(
  attachmentId: string,
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: dbError } = await supabase
    .from('request_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) {
    throw toServiceError(dbError, 'Unable to remove attachment record.');
  }

  const { error: storageError } = await supabase.storage
    .from(REQUIREMENTS_BUCKET)
    .remove([storagePath]);

  if (storageError) {
    throw toServiceError(storageError, 'Attachment record removed, but file deletion failed.');
  }
}

export async function listRequestAttachments(requestId: string): Promise<RequestAttachment[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('request_attachments')
    .select('*')
    .eq('request_id', requestId)
    .order('uploaded_at', { ascending: true });

  if (error) {
    throw toServiceError(error, 'Unable to load request attachments.');
  }

  return data ?? [];
}

/**
 * Mints a 60-second expiring signed URL for viewing a private requirement file.
 * When `logAudit` is true (default whenever `requestId` is supplied, e.g. staff
 * reviewing an ID), records an `attachment_viewed` entry in `audit_logs`.
 */
export async function getSignedAttachmentUrl(
  storagePath: string,
  options: { requestId?: string; logAudit?: boolean } = {}
): Promise<SignedAttachmentUrl> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(REQUIREMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw toServiceError(error, 'Unable to generate temporary attachment link.');
  }

  const shouldLogAudit = options.logAudit ?? Boolean(options.requestId);
  if (shouldLogAudit) {
    try {
      await appendAuditLog({
        action: 'attachment_viewed',
        requestId: options.requestId ?? null,
        metadata: { storage_path: storagePath, ttl_seconds: SIGNED_URL_TTL_SECONDS },
      });
    } catch {
      // Residents viewing their own uploads cannot insert into audit_logs (staff-only policy);
      // do not block preview generation if the caller is not staff.
    }
  }

  return {
    signedUrl: data.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  };
}
