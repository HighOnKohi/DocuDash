import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { RequestStatus } from '@/types/database';

export const NOTIFICATION_CHANNEL_ID = 'docudash-updates';
const NOTIFICATIONS_ENABLED_KEY = 'docudash.notifications.enabled';
const PICKUP_REMINDER_PREFIX = 'docudash-pickup-';
const BRAND_PRIMARY_HEX = '#01227F';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

let handlerConfigured = false;
let channelReadyPromise: Promise<void> | null = null;

/**
 * Local push notifications & scheduled pickup reminders are supported on native
 * Android and iOS builds. Web browsers rely on live in-app updates + email.
 */
export function isNativeNotificationsSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function mapPermissionResponse(
  settings: Notifications.NotificationPermissionsStatus
): NotificationPermissionStatus {
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }
  if (settings.status === Notifications.PermissionStatus.DENIED || !settings.canAskAgain) {
    return 'denied';
  }
  return 'undetermined';
}

/**
 * Configures foreground notification presentation behavior once on native.
 */
export function configureNotificationHandler(): void {
  if (!isNativeNotificationsSupported() || handlerConfigured) {
    return;
  }

  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ensures the Android notification channel exists before prompting or
 * scheduling notifications (required on Android 8+ / 13+).
 */
export async function ensureNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  if (!channelReadyPromise) {
    channelReadyPromise = Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Request & Pickup Updates',
      description:
        'Alerts when your barangay document status changes or your pickup slot is approaching.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: BRAND_PRIMARY_HEX,
    })
      .then(() => undefined)
      .catch((error) => {
        channelReadyPromise = null;
        throw error;
      });
  }

  await channelReadyPromise;
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isNativeNotificationsSupported()) {
    return 'unsupported';
  }

  const settings = await Notifications.getPermissionsAsync();
  return mapPermissionResponse(settings);
}

export async function requestNotificationPermissions(): Promise<NotificationPermissionStatus> {
  if (!isNativeNotificationsSupported()) {
    return 'unsupported';
  }

  await ensureNotificationChannelAsync();
  const settings = await Notifications.requestPermissionsAsync();
  return mapPermissionResponse(settings);
}

export async function getNotificationsEnabledPreference(): Promise<boolean> {
  if (!isNativeNotificationsSupported()) {
    return false;
  }

  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export async function setNotificationsEnabledPreference(enabled: boolean): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
}

function getImmediateTrigger(): Notifications.NotificationTriggerInput {
  return Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null;
}

export interface StatusNotificationInput {
  requestId: string;
  documentName: string;
  status: Exclude<RequestStatus, 'pending'>;
  rejectionReason?: string | null;
}

/**
 * Presents a local notification banner when a resident's document request
 * transitions to a new status.
 */
export async function presentStatusChangeNotification(
  input: StatusNotificationInput
): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  const permission = await getNotificationPermissionStatus();
  if (permission !== 'granted') {
    return;
  }

  await ensureNotificationChannelAsync();

  let title = 'Document Request Update';
  let body = `Your ${input.documentName} request status has been updated.`;

  switch (input.status) {
    case 'reviewing':
      title = 'Request Under Review';
      body = `Barangay staff are now reviewing your ${input.documentName} request.`;
      break;
    case 'ready':
      title = 'Ready for Pickup';
      body = `Your ${input.documentName} is approved! Open DocuDash to view your QR pickup pass.`;
      break;
    case 'completed':
      title = 'Document Released';
      body = `Your ${input.documentName} pickup has been verified and completed.`;
      break;
    case 'rejected': {
      title = 'Request Needs Attention';
      const trimmedReason = input.rejectionReason?.trim();
      body = trimmedReason
        ? `${input.documentName}: ${trimmedReason}`
        : `Your ${input.documentName} request was not approved. Tap to review details.`;
      break;
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { requestId: input.requestId, status: input.status },
      color: BRAND_PRIMARY_HEX,
      sound: 'default',
    },
    trigger: getImmediateTrigger(),
  });
}

/**
 * Parses `YYYY-MM-DD` and the start time of a slot window (e.g. `08:00-10:00`
 * or `1:00 PM - 3:00 PM`) into a local `Date`.
 */
export function parseSlotStartDate(slotDate: string, timeWindow: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slotDate.trim());
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const startPart = timeWindow.split('-')[0]?.trim() ?? '';
  const timeMatch = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(startPart);
  if (!timeMatch) return null;

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const meridiem = timeMatch[3]?.toUpperCase();

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export interface PickupReminderInput {
  requestId: string;
  documentName: string;
  slotDate: string;
  timeWindow: string;
}

/**
 * Schedules a local reminder 60 minutes (or 15 minutes if < 60 min away) before
 * a reserved barangay pickup slot. Cancels any prior reminder for that request.
 */
export async function schedulePickupReminder(
  input: PickupReminderInput
): Promise<string | null> {
  if (!isNativeNotificationsSupported()) {
    return null;
  }

  const identifier = `${PICKUP_REMINDER_PREFIX}${input.requestId}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const permission = await getNotificationPermissionStatus();
  if (permission !== 'granted') {
    return null;
  }

  const slotStart = parseSlotStartDate(input.slotDate, input.timeWindow);
  if (!slotStart) {
    return null;
  }

  const nowMs = Date.now();
  const sixtyMinutesBeforeMs = slotStart.getTime() - 60 * 60 * 1000;
  const fifteenMinutesBeforeMs = slotStart.getTime() - 15 * 60 * 1000;

  let triggerDateMs: number | null = null;
  if (sixtyMinutesBeforeMs > nowMs + 60 * 1000) {
    triggerDateMs = sixtyMinutesBeforeMs;
  } else if (fifteenMinutesBeforeMs > nowMs + 60 * 1000) {
    triggerDateMs = fifteenMinutesBeforeMs;
  }

  if (!triggerDateMs) {
    return null;
  }

  await ensureNotificationChannelAsync();

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Upcoming Barangay Pickup',
      body: `Reminder: Your ${input.documentName} pickup window (${input.timeWindow}) starts soon. Bring your QR pass and valid ID.`,
      data: { requestId: input.requestId, kind: 'pickup_reminder' },
      color: BRAND_PRIMARY_HEX,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerDateMs),
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });
}

export async function cancelPickupReminder(requestId: string): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(
    `${PICKUP_REMINDER_PREFIX}${requestId}`
  ).catch(() => {});
}

export async function cancelAllDocuDashNotifications(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

/**
 * Triggers an immediate local alert on mobile to confirm notifications are active.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (!isNativeNotificationsSupported()) {
    return false;
  }

  const permission = await getNotificationPermissionStatus();
  if (permission !== 'granted') {
    return false;
  }

  await ensureNotificationChannelAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'DocuDash Alerts Active',
      body: 'You will receive status updates and pickup reminders on this device.',
      color: BRAND_PRIMARY_HEX,
      sound: 'default',
    },
    trigger: getImmediateTrigger(),
  });

  return true;
}

/**
 * Listens for notification taps (both warm foreground/background and cold-start
 * last response) and passes `requestId` to the navigation callback once per tap.
 */
export function subscribeToNotificationTaps(
  onOpenRequest: (requestId: string) => void
): () => void {
  if (!isNativeNotificationsSupported()) {
    return () => {};
  }

  let active = true;
  const handledIdentifiers = new Set<string>();

  const handleResponse = (response: Notifications.NotificationResponse | null | undefined) => {
    if (!active || !response) return;
    const notifId = response.notification.request.identifier;
    if (handledIdentifiers.has(notifId)) return;

    const requestId = response.notification.request.content.data?.requestId;
    if (typeof requestId === 'string' && requestId.trim().length > 0) {
      handledIdentifiers.add(notifId);
      onOpenRequest(requestId);
    }
  };

  void Notifications.getLastNotificationResponseAsync()
    .then(handleResponse)
    .catch(() => {});

  const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

  return () => {
    active = false;
    subscription.remove();
  };
}
