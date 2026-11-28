import type {
  PaymentMethod,
  PaymentStatus,
  PaymentTiming,
  RequestStatus,
} from '@/types/database';

/** Formats a numeric fee in Philippine Pesos (returns "Free" for zero fees). */
export function formatFee(fee: number): string {
  if (!Number.isFinite(fee) || fee <= 0) {
    return 'Free';
  }
  return `PHP ${fee.toFixed(2)}`;
}

/** Formats an ISO timestamp in readable Asia/Manila local date & time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Formats a `YYYY-MM-DD` slot date into a human-friendly calendar label. */
export function formatSlotDate(slotDate: string): string {
  const parts = slotDate.split('-').map((part) => Number.parseInt(part, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return slotDate;

  const utcDate = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(utcDate);
  } catch {
    return slotDate;
  }
}

/** Converts 24-hour `"08:00-10:00"` into `"8:00 AM - 10:00 AM"`. */
export function formatTimeWindow(timeWindow: string): string {
  const [start, end] = timeWindow.split('-');
  if (!start || !end) return timeWindow;

  const formatPart = (hhmm: string): string => {
    const [hStr, mStr] = hhmm.split(':');
    const hour24 = Number.parseInt(hStr ?? '', 10);
    const minute = mStr ?? '00';
    if (Number.isNaN(hour24)) return hhmm;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${minute} ${suffix}`;
  };

  return `${formatPart(start)} - ${formatPart(end)}`;
}

export function getStatusLabel(status: RequestStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'reviewing':
      return 'Under Review';
    case 'ready':
      return 'Ready for Pickup';
    case 'completed':
      return 'Completed';
    case 'rejected':
      return 'Rejected';
  }
}

export function getStatusDescription(status: RequestStatus): string {
  switch (status) {
    case 'pending':
      return 'Waiting for barangay staff to pick up your request for review.';
    case 'reviewing':
      return 'Barangay staff are currently verifying your requirements.';
    case 'ready':
      return 'Approved and ready! Present your QR pickup pass at the barangay counter.';
    case 'completed':
      return 'Document has been verified and released.';
    case 'rejected':
      return 'This request could not be approved. Review the staff note below.';
  }
}

export function formatAuditAction(action: string): string {
  switch (action) {
    case 'request_created':
      return 'Request submitted';
    case 'request_reviewing':
      return 'Review started';
    case 'request_approved':
      return 'Approved & QR pass issued';
    case 'request_rejected':
      return 'Request rejected';
    case 'slot_booked':
      return 'Pickup slot booked';
    case 'slot_rebooked':
      return 'Pickup slot changed';
    case 'pickup_verified':
      return 'QR pickup verified & released';
    case 'attachment_viewed':
      return 'Requirement file viewed (60s signed URL)';
    case 'attachments_purged':
      return 'Expired requirements purged (RA 10173)';
    case 'notification_dispatched':
      return 'Resident notification dispatched';
    case 'account_deleted':
      return 'Account erased (RA 10173)';
    case 'payment_submitted':
      return 'GCash payment proof submitted';
    case 'payment_verified':
      return 'Payment verified';
    case 'payment_rejected':
      return 'Payment proof rejected';
    case 'barangay_updated':
      return 'Barangay office details updated';
    case 'manager_role_updated':
      return 'App Manager updated account role';
    case 'manager_barangay_assigned':
      return 'App Manager updated barangay assignment';
    case 'manager_admin_request_updated':
      return 'App Manager reviewed barangay admin request';
    case 'manager_barangay_toggled':
      return 'App Manager toggled barangay active status';
    case 'manager_document_type_updated':
      return 'App Manager updated document type config';
    case 'manager_user_deleted':
      return 'App Manager erased user account';
    default:
      return action.replace(/_/g, ' ');
  }
}

/** Returns a concise human-readable payment status label. */
export function getPaymentStatusLabel(
  status: PaymentStatus,
  method: PaymentMethod,
  timing: PaymentTiming
): string {
  switch (status) {
    case 'waived':
      return 'Free';
    case 'verified':
      return method === 'gcash' ? 'Paid (GCash)' : 'Paid (Cash)';
    case 'submitted':
      return 'GCash Checking';
    case 'rejected':
      return 'Proof Rejected';
    case 'unpaid':
      if (method === 'gcash' && timing === 'pay_now') {
        return 'GCash Pending';
      }
      return method === 'gcash' ? 'GCash on Pickup' : 'Cash on Pickup';
  }
}

/** Shifts a `YYYY-MM-DD` date string by `days` calendar days. */
export function addDaysToDate(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map((p) => Number.parseInt(p, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return dateStr;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
