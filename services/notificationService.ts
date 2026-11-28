import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { RequestStatus } from '@/types/database';

import { getSupabaseClient } from './supabase';

export const NOTIFICATION_CHANNEL_ID = 'docudash-updates-v2';
const LEGACY_NOTIFICATION_CHANNEL_ID = 'docudash-updates';
const NOTIFICATIONS_ENABLED_KEY = 'docudash.notifications.enabled';
const PUSH_TOKEN_STORAGE_KEY = 'docudash.notifications.expo_push_token';
const STATUS_SNAPSHOT_PREFIX = 'docudash.notifications.statuses.';
const INBOX_STORAGE_PREFIX = 'docudash.notifications.inbox.';
const PICKUP_REMINDER_PREFIX = 'docudash-pickup-';
const BRAND_PRIMARY_HEX = '#01227F';
const MAX_INBOX_ITEMS = 30;

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export interface NotificationPermissionDetails {
  status: NotificationPermissionStatus;
  canAskAgain: boolean;
}

export interface StatusNotificationInput {
  requestId: string;
  documentName: string;
  status: Exclude<RequestStatus, 'pending'>;
  rejectionReason?: string | null;
}

export interface InAppNotificationItem {
  id: string;
  requestId: string;
  documentName: string;
  status: Exclude<RequestStatus, 'pending'>;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

let handlerConfigured = false;
let channelReadyPromise: Promise<void> | null = null;

/**
 * Local & remote push notifications are supported on native Android/iOS builds.
 * Web browsers use live in-app banners + optional Web Notification API alerts.
 */
export function isNativeNotificationsSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export function isWebNotificationsSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.Notification !== 'undefined'
  );
}

export function getWebNotificationPermission(): NotificationPermissionStatus {
  if (!isWebNotificationsSupported()) {
    return 'unsupported';
  }
  switch (window.Notification.permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'undetermined';
  }
}

export async function requestWebNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isWebNotificationsSupported()) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return getWebNotificationPermission();
  }
}

/** Shared status copy used across native OS banners, web alerts, and in-app toasts. */
export function buildStatusNotificationCopy(
  input: StatusNotificationInput
): { title: string; body: string } {
  switch (input.status) {
    case 'reviewing':
      return {
        title: 'Request Under Review',
        body: `Barangay staff are now reviewing your ${input.documentName} request.`,
      };
    case 'ready':
      return {
        title: 'Ready for Pickup',
        body: `Your ${input.documentName} is approved! Open DocuDash to view your QR pickup pass.`,
      };
    case 'completed':
      return {
        title: 'Document Released',
        body: `Your ${input.documentName} pickup has been verified and completed.`,
      };
    case 'rejected': {
      const trimmedReason = input.rejectionReason?.trim();
      return {
        title: 'Request Needs Attention',
        body: trimmedReason
          ? `${input.documentName}: ${trimmedReason}`
          : `Your ${input.documentName} request was not approved. Tap to review details.`,
      };
    }
  }
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
 * Configures foreground notification presentation behavior once on native so
 * status changes still show a heads-up alert even while DocuDash is open.
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
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

/**
 * Ensures the MAX-importance Android notification channel exists before prompting
 * or scheduling notifications (required on Android 8+ / 13+ for heads-up alerts).
 */
export async function ensureNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  if (!channelReadyPromise) {
    channelReadyPromise = (async () => {
      await Notifications.deleteNotificationChannelAsync(LEGACY_NOTIFICATION_CHANNEL_ID).catch(
        () => {}
      );
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Request & Pickup Updates',
        description:
          'High-priority alerts when your barangay document is ready for pickup or approaching its slot.',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: BRAND_PRIMARY_HEX,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    })().catch((error) => {
      channelReadyPromise = null;
      throw error;
    });
  }

  await channelReadyPromise;
}

export async function getNotificationPermissionDetails(): Promise<NotificationPermissionDetails> {
  if (!isNativeNotificationsSupported()) {
    return { status: 'unsupported', canAskAgain: false };
  }

  const settings = await Notifications.getPermissionsAsync();
  const status = mapPermissionResponse(settings);
  return {
    status,
    canAskAgain: status === 'granted' ? true : (settings.canAskAgain ?? status !== 'denied'),
  };
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const details = await getNotificationPermissionDetails();
  return details.status;
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
  if (!isNativeNotificationsSupported() && !isWebNotificationsSupported()) {
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
  if (!isNativeNotificationsSupported() && !isWebNotificationsSupported()) {
    return;
  }

  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function loadKnownRequestStatuses(
  userId: string
): Promise<Record<string, RequestStatus> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STATUS_SNAPSHOT_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, RequestStatus>;
  } catch {
    return null;
  }
}

export async function saveKnownRequestStatuses(
  userId: string,
  map: Record<string, RequestStatus>
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STATUS_SNAPSHOT_PREFIX}${userId}`, JSON.stringify(map));
  } catch {
    // Non-fatal persistence failure.
  }
}

export async function loadNotificationInbox(userId: string): Promise<InAppNotificationItem[]> {
  try {
    const raw = await AsyncStorage.getItem(`${INBOX_STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_INBOX_ITEMS) as InAppNotificationItem[];
  } catch {
    return [];
  }
}

export async function saveNotificationInbox(
  userId: string,
  items: InAppNotificationItem[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${INBOX_STORAGE_PREFIX}${userId}`,
      JSON.stringify(items.slice(0, MAX_INBOX_ITEMS))
    );
  } catch {
    // Non-fatal persistence failure.
  }
}

function getImmediateTrigger(): Notifications.NotificationTriggerInput {
  return Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null;
}

/**
 * Fires a native device notification immediately using MAX priority so Android
 * displays a heads-up banner and iOS displays a banner + sound.
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
  const { title, body } = buildStatusNotificationCopy(input);

  await Notifications.scheduleNotificationAsync({
    identifier: `status-${input.requestId}-${input.status}`,
    content: {
      title,
      body,
      data: { requestId: input.requestId, status: input.status },
      color: BRAND_PRIMARY_HEX,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: getImmediateTrigger(),
  });
}

/** Fires a browser/PWA desktop notification when Web Notification permission is granted. */
export function presentWebStatusNotification(
  input: StatusNotificationInput,
  onOpenRequest?: (requestId: string) => void
): void {
  if (getWebNotificationPermission() !== 'granted') {
    return;
  }

  try {
    const { title, body } = buildStatusNotificationCopy(input);
    const notif = new window.Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      tag: `${input.requestId}:${input.status}`,
    });
    notif.onclick = () => {
      window.focus();
      onOpenRequest?.(input.requestId);
      notif.close();
    };
  } catch {
    // Ignore browser notification restrictions inside unsupported embedded webviews.
  }
}

/**
 * Registers the current physical device's Expo Push Token in `user_push_tokens`
 * so Vercel `POST /api/notify-resident` can send remote push notifications.
 * Fails gracefully if FCM/APNs credentials are not configured on a sideloaded APK.
 */
export async function registerExpoPushTokenForUser(userId: string): Promise<string | null> {
  if (!isNativeNotificationsSupported() || !Device.isDevice) {
    return null;
  }

  const permission = await getNotificationPermissionStatus();
  if (permission !== 'granted') {
    return null;
  }

  await ensureNotificationChannelAsync();

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data?.trim();
    if (!expoPushToken) {
      return null;
    }

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform,
      },
      { onConflict: 'expo_push_token' }
    );

    if (!error) {
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, expoPushToken).catch(() => {});
    }

    return expoPushToken;
  } catch {
    return null;
  }
}

/** Removes any stored Expo Push Token for this device on sign-out or pause. */
export async function unregisterExpoPushToken(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  try {
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (stored) {
      const supabase = getSupabaseClient();
      await supabase.from('user_push_tokens').delete().eq('expo_push_token', stored);
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Best-effort cleanup only.
  }
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
      priority: Notifications.AndroidNotificationPriority.MAX,
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
 * Triggers an immediate local alert on mobile (or web notification when granted)
 * to confirm notifications are active.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (isWebNotificationsSupported()) {
    if (getWebNotificationPermission() !== 'granted') {
      return false;
    }
    try {
      new window.Notification('DocuDash Alerts Active', {
        body: 'You will receive Ready for Pickup alerts and document status updates.',
        icon: '/icons/icon-192.png',
      });
      return true;
    } catch {
      return false;
    }
  }

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
      body: 'You will receive Ready for Pickup alerts and pickup reminders on this device.',
      color: BRAND_PRIMARY_HEX,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
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
