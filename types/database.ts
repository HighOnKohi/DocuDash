/**
 * Shared TypeScript types mirroring the PostgreSQL schema in
 * `supabase/migrations/001_schema.sql` through `004_storage.sql`.
 *
 * Compatible with `@supabase/supabase-js` v2 generics (`createClient<Database>`).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'resident' | 'staff' | 'admin';

export type RequestStatus = 'pending' | 'reviewing' | 'ready' | 'completed' | 'rejected';

export type PaymentMethod = 'cash' | 'gcash';

export type PaymentTiming = 'pay_now' | 'pay_on_pickup';

export type PaymentStatus = 'unpaid' | 'submitted' | 'verified' | 'rejected' | 'waived';

/** One required document entry inside `document_types.required_docs`. */
export interface RequiredDocSpec {
  key: string;
  label: string;
  description: string;
}

/** Allowed audit action identifiers written to `public.audit_logs`. */
export type AuditAction =
  | 'request_created'
  | 'request_reviewing'
  | 'request_approved'
  | 'request_rejected'
  | 'slot_booked'
  | 'slot_rebooked'
  | 'pickup_verified'
  | 'attachment_viewed'
  | 'attachments_purged'
  | 'notification_dispatched'
  | 'account_deleted'
  | 'payment_submitted'
  | 'payment_verified'
  | 'payment_rejected'
  | 'barangay_updated';

export interface Database {
  public: {
    Tables: {
      barangays: {
        Row: {
          id: string;
          psgc_code: string | null;
          name: string;
          city_municipality: string;
          province: string;
          region: string;
          hall_address: string;
          hall_latitude: number | null;
          hall_longitude: number | null;
          google_maps_url: string | null;
          gcash_qr_storage_path: string | null;
          gcash_account_name: string | null;
          gcash_account_number: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          psgc_code?: string | null;
          name: string;
          city_municipality: string;
          province?: string;
          region?: string;
          hall_address?: string;
          hall_latitude?: number | null;
          hall_longitude?: number | null;
          google_maps_url?: string | null;
          gcash_qr_storage_path?: string | null;
          gcash_account_name?: string | null;
          gcash_account_number?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          psgc_code?: string | null;
          name?: string;
          city_municipality?: string;
          province?: string;
          region?: string;
          hall_address?: string;
          hall_latitude?: number | null;
          hall_longitude?: number | null;
          google_maps_url?: string | null;
          gcash_qr_storage_path?: string | null;
          gcash_account_name?: string | null;
          gcash_account_number?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      barangay_admin_requests: {
        Row: {
          id: string;
          psgc_code: string | null;
          barangay_name: string;
          city_municipality: string;
          province: string;
          region: string;
          hall_address: string;
          google_maps_url: string | null;
          applicant_name: string;
          applicant_position: string;
          applicant_email: string;
          contact_number: string;
          notes: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          psgc_code?: string | null;
          barangay_name: string;
          city_municipality: string;
          province?: string;
          region?: string;
          hall_address?: string;
          google_maps_url?: string | null;
          applicant_name: string;
          applicant_position: string;
          applicant_email: string;
          contact_number: string;
          notes?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          status?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          address: string;
          contact_number: string;
          role: UserRole;
          privacy_consent_at: string;
          created_at: string;
          barangay_id: string | null;
          barangay_code: string | null;
          barangay_name: string | null;
          city_municipality: string | null;
          province: string | null;
          region: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          address: string;
          contact_number: string;
          role?: UserRole;
          privacy_consent_at: string;
          created_at?: string;
          barangay_id?: string | null;
          barangay_code?: string | null;
          barangay_name?: string | null;
          city_municipality?: string | null;
          province?: string | null;
          region?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string;
          address?: string;
          contact_number?: string;
          role?: UserRole;
          privacy_consent_at?: string;
          created_at?: string;
          barangay_id?: string | null;
          barangay_code?: string | null;
          barangay_name?: string | null;
          city_municipality?: string | null;
          province?: string | null;
          region?: string | null;
        };
        Relationships: [];
      };
      document_types: {
        Row: {
          id: string;
          name: string;
          description: string;
          fee: number;
          required_docs: RequiredDocSpec[];
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          fee?: number;
          required_docs?: RequiredDocSpec[];
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          fee?: number;
          required_docs?: RequiredDocSpec[];
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      pickup_slots: {
        Row: {
          id: string;
          slot_date: string;
          time_window: string;
          max_capacity: number;
          booked_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slot_date: string;
          time_window: string;
          max_capacity: number;
          booked_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slot_date?: string;
          time_window?: string;
          max_capacity?: number;
          booked_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      requests: {
        Row: {
          id: string;
          resident_id: string;
          document_type_id: string;
          purpose: string;
          status: RequestStatus;
          rejection_reason: string | null;
          pickup_slot_id: string | null;
          qr_token: string | null;
          reviewed_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          barangay_id: string | null;
          payment_method: PaymentMethod;
          payment_timing: PaymentTiming;
          payment_status: PaymentStatus;
          payment_amount: number;
          payment_reference: string | null;
          payment_proof_path: string | null;
          payment_notes: string | null;
          payment_verified_by: string | null;
          payment_verified_at: string | null;
        };
        Insert: {
          id?: string;
          resident_id: string;
          document_type_id: string;
          purpose: string;
          status?: RequestStatus;
          rejection_reason?: string | null;
          pickup_slot_id?: string | null;
          qr_token?: string | null;
          reviewed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          barangay_id?: string | null;
          payment_method?: PaymentMethod;
          payment_timing?: PaymentTiming;
          payment_status?: PaymentStatus;
          payment_amount?: number;
          payment_reference?: string | null;
          payment_proof_path?: string | null;
          payment_notes?: string | null;
          payment_verified_by?: string | null;
          payment_verified_at?: string | null;
        };
        Update: {
          id?: string;
          resident_id?: string;
          document_type_id?: string;
          purpose?: string;
          status?: RequestStatus;
          rejection_reason?: string | null;
          pickup_slot_id?: string | null;
          qr_token?: string | null;
          reviewed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          barangay_id?: string | null;
          payment_method?: PaymentMethod;
          payment_timing?: PaymentTiming;
          payment_status?: PaymentStatus;
          payment_amount?: number;
          payment_reference?: string | null;
          payment_proof_path?: string | null;
          payment_notes?: string | null;
          payment_verified_by?: string | null;
          payment_verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'requests_resident_id_fkey';
            columns: ['resident_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_document_type_id_fkey';
            columns: ['document_type_id'];
            isOneToOne: false;
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_pickup_slot_id_fkey';
            columns: ['pickup_slot_id'];
            isOneToOne: false;
            referencedRelation: 'pickup_slots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_barangay_id_fkey';
            columns: ['barangay_id'];
            isOneToOne: false;
            referencedRelation: 'barangays';
            referencedColumns: ['id'];
          },
        ];
      };
      request_attachments: {
        Row: {
          id: string;
          request_id: string;
          storage_path: string;
          doc_type: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          storage_path: string;
          doc_type: string;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          storage_path?: string;
          doc_type?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_attachments_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          request_id: string | null;
          metadata: Record<string, Json | undefined>;
          created_at: string;
        };
        Insert: {
          id?: never;
          actor_id?: string | null;
          action: string;
          request_id?: string | null;
          metadata?: Record<string, Json | undefined>;
          created_at?: string;
        };
        Update: {
          id?: never;
          actor_id?: never;
          action?: never;
          request_id?: never;
          metadata?: never;
          created_at?: never;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      book_pickup_slot: {
        Args: {
          p_request_id: string;
          p_slot_id: string;
        };
        Returns: Database['public']['Tables']['requests']['Row'];
      };
      verify_pickup: {
        Args: {
          p_qr_token: string;
          p_staff_id: string;
        };
        Returns: Database['public']['Tables']['requests']['Row'];
      };
      get_expired_attachment_paths: {
        Args: {
          p_retention_days?: number;
        };
        Returns: {
          attachment_id: string;
          request_id: string;
          storage_path: string;
        }[];
      };
      assign_my_barangay: {
        Args: {
          p_barangay_code: string | null;
          p_barangay_name: string;
          p_city_municipality: string;
          p_province?: string;
          p_region?: string;
        };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      set_request_payment_option: {
        Args: {
          p_request_id: string;
          p_method: PaymentMethod;
          p_timing: PaymentTiming;
        };
        Returns: Database['public']['Tables']['requests']['Row'];
      };
      submit_gcash_payment: {
        Args: {
          p_request_id: string;
          p_reference_number: string;
          p_proof_path: string;
        };
        Returns: Database['public']['Tables']['requests']['Row'];
      };
      verify_request_payment: {
        Args: {
          p_request_id: string;
          p_decision: 'verified' | 'rejected';
          p_method?: PaymentMethod | null;
          p_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: Database['public']['Tables']['requests']['Row'];
      };
    };
    Enums: {
      user_role: UserRole;
      request_status: RequestStatus;
      payment_method: PaymentMethod;
      payment_timing: PaymentTiming;
      payment_status: PaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

// -----------------------------------------------------------------------------
// Domain aliases
// -----------------------------------------------------------------------------
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Pick<
  Database['public']['Tables']['profiles']['Update'],
  'full_name' | 'address' | 'contact_number'
>;

export type DocumentType = Database['public']['Tables']['document_types']['Row'];
export type PickupSlot = Database['public']['Tables']['pickup_slots']['Row'];
export type PickupSlotInsert = Pick<
  Database['public']['Tables']['pickup_slots']['Insert'],
  'slot_date' | 'time_window' | 'max_capacity'
>;
export type PickupSlotUpdate = Pick<
  Database['public']['Tables']['pickup_slots']['Update'],
  'slot_date' | 'time_window' | 'max_capacity'
>;

export type Barangay = Database['public']['Tables']['barangays']['Row'];
export type BarangayUpdate = Pick<
  Database['public']['Tables']['barangays']['Update'],
  | 'hall_address'
  | 'hall_latitude'
  | 'hall_longitude'
  | 'google_maps_url'
  | 'gcash_qr_storage_path'
  | 'gcash_account_name'
  | 'gcash_account_number'
>;

export type DocumentRequest = Database['public']['Tables']['requests']['Row'];
export type RequestAttachment = Database['public']['Tables']['request_attachments']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

/** Hydrated request row returned by list/detail queries with joined relations. */
export interface RequestWithDetails extends DocumentRequest {
  document_type: Pick<DocumentType, 'id' | 'name' | 'fee' | 'required_docs'> | null;
  pickup_slot: Pick<PickupSlot, 'id' | 'slot_date' | 'time_window' | 'max_capacity' | 'booked_count'> | null;
  resident?: Pick<Profile, 'id' | 'full_name' | 'address' | 'contact_number'> | null;
  reviewer?: Pick<Profile, 'id' | 'full_name'> | null;
  barangay?: Barangay | null;
  attachments?: RequestAttachment[];
}

/** Response returned by Vercel `POST /api/verify-pickup`. */
export interface VerifyPickupResponse {
  ok: true;
  request: DocumentRequest;
  resident: Pick<Profile, 'id' | 'full_name' | 'address' | 'contact_number'>;
  documentType: Pick<DocumentType, 'id' | 'name' | 'fee'>;
  pickupSlot: Pick<PickupSlot, 'id' | 'slot_date' | 'time_window'> | null;
}

/** Request payload accepted by Vercel `POST /api/notify-resident`. */
export interface NotifyResidentPayload {
  requestId: string;
  event: 'reviewing' | 'ready' | 'rejected' | 'completed' | 'slot_reminder';
  message?: string;
}

/** Response returned by Vercel `POST /api/notify-resident`. */
export interface NotifyResidentResponse {
  ok: true;
  requestId: string;
  event: NotifyResidentPayload['event'];
  deliveredVia: 'email' | 'in_app_logged';
  emailId?: string;
  auditLogged: true;
}

/** Request payload accepted by Vercel `POST /api/purge-attachments`. */
export interface PurgeAttachmentsPayload {
  retentionDays?: number;
  dryRun?: boolean;
}

/** Response returned by Vercel `POST /api/purge-attachments`. */
export interface PurgeAttachmentsResponse {
  ok: true;
  retentionDays: number;
  dryRun: boolean;
  matchedCount: number;
  purgedCount: number;
  failedCount: number;
  affectedRequestCount: number;
  hasMore: boolean;
  auditLogged: boolean;
  triggeredBy: 'cron_secret' | 'admin';
}

/** Request payload accepted by Vercel `POST /api/delete-account`. */
export interface DeleteAccountPayload {
  confirmation: 'DELETE';
}

/** Response returned by Vercel `POST /api/delete-account`. */
export interface DeleteAccountResponse {
  ok: true;
  deletedRequestsCount: number;
  deletedAttachmentsCount: number;
  auditLogged: boolean;
}

/** Request payload accepted by Vercel `POST /api/request-barangay-admin`. */
export interface BarangayAdminRequestPayload {
  psgcCode?: string | null;
  barangayName: string;
  cityMunicipality: string;
  province?: string;
  region?: string;
  hallAddress: string;
  googleMapsUrl?: string | null;
  applicantName: string;
  applicantPosition: string;
  applicantEmail: string;
  contactNumber: string;
  notes?: string | null;
}

/** Response returned by Vercel `POST /api/request-barangay-admin`. */
export interface BarangayAdminRequestResponse {
  ok: true;
  requestId: string | null;
  emailedTo: string;
  deliveredVia: 'email' | 'recorded_only';
}

/** Standard error response returned by Vercel `/api/*` endpoints. */
export interface ApiErrorResponse {
  ok: false;
  code: string;
  error: string;
}
