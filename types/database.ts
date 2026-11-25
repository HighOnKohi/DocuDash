/**
 * Shared TypeScript types mirroring the PostgreSQL schema in
 * `supabase/migrations/001_schema.sql` through `004_storage.sql`.
 *
 * Compatible with `@supabase/supabase-js` v2 generics (`createClient<Database>`).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'resident' | 'staff' | 'admin';

export type RequestStatus = 'pending' | 'reviewing' | 'ready' | 'completed' | 'rejected';

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
  | 'notification_dispatched';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          address: string;
          contact_number: string;
          role: UserRole;
          privacy_consent_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          address: string;
          contact_number: string;
          role?: UserRole;
          privacy_consent_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          address?: string;
          contact_number?: string;
          role?: UserRole;
          privacy_consent_at?: string;
          created_at?: string;
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
    };
    Enums: {
      user_role: UserRole;
      request_status: RequestStatus;
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

export type DocumentRequest = Database['public']['Tables']['requests']['Row'];
export type RequestAttachment = Database['public']['Tables']['request_attachments']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

/** Hydrated request row returned by list/detail queries with joined relations. */
export interface RequestWithDetails extends DocumentRequest {
  document_type: Pick<DocumentType, 'id' | 'name' | 'fee' | 'required_docs'> | null;
  pickup_slot: Pick<PickupSlot, 'id' | 'slot_date' | 'time_window' | 'max_capacity' | 'booked_count'> | null;
  resident?: Pick<Profile, 'id' | 'full_name' | 'address' | 'contact_number'> | null;
  reviewer?: Pick<Profile, 'id' | 'full_name'> | null;
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

/** Standard error response returned by Vercel `/api/*` endpoints. */
export interface ApiErrorResponse {
  ok: false;
  code: string;
  error: string;
}
