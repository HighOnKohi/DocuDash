import { router } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import {
  cancelAllDocuDashNotifications,
  cancelPickupReminder,
  configureNotificationHandler,
  getNotificationPermissionStatus,
  getNotificationsEnabledPreference,
  isNativeNotificationsSupported,
  presentStatusChangeNotification,
  requestNotificationPermissions,
  schedulePickupReminder,
  sendTestNotification,
  setNotificationsEnabledPreference,
  subscribeToNotificationTaps,
  type NotificationPermissionStatus,
} from '@/services/notificationService';
import {
  getRequestById,
  listResidentRequests,
  subscribeToResidentRequests,
} from '@/services/requestService';
import type { RequestStatus } from '@/types/database';

export interface NotificationContextValue {
  isSupported: boolean;
  permissionStatus: NotificationPermissionStatus;
  enabled: boolean;
  busy: boolean;
  enableNotifications: () => Promise<NotificationPermissionStatus>;
  disableNotifications: () => Promise<void>;
  sendTestAlert: () => Promise<boolean>;
  refreshPermissionStatus: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const value = use(NotificationContext);
  if (!value) {
    throw new Error('useNotifications must be used inside <NotificationProvider>.');
  }
  return value;
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const isSupported = isNativeNotificationsSupported();
  const { user, isAuthenticated, isStaff } = useAuth();
  const userId = user?.id ?? null;

  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(
    isSupported ? 'undetermined' : 'unsupported'
  );
  const [enabled, setEnabled] = useState<boolean>(isSupported);
  const [busy, setBusy] = useState(false);

  const statusMapRef = useRef<Map<string, RequestStatus>>(new Map());

  const refreshPermissionStatus = useCallback(async () => {
    if (!isSupported) return;
    const status = await getNotificationPermissionStatus();
    setPermissionStatus(status);
  }, [isSupported]);

  // Configure foreground handler & load initial preference + permission status.
  useEffect(() => {
    if (!isSupported) return;

    configureNotificationHandler();
    let active = true;

    void Promise.all([
      getNotificationsEnabledPreference(),
      getNotificationPermissionStatus(),
    ]).then(([storedEnabled, osStatus]) => {
      if (!active) return;
      setEnabled(storedEnabled);
      setPermissionStatus(osStatus);
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void getNotificationPermissionStatus().then((osStatus) => {
          if (active) setPermissionStatus(osStatus);
        });
      }
    });

    return () => {
      active = false;
      appStateSub.remove();
    };
  }, [isSupported]);

  // Keep local status alerts and pickup reminders synced for signed-in residents.
  useEffect(() => {
    if (!isSupported) return;

    if (!isAuthenticated || isStaff || !userId || !enabled || permissionStatus !== 'granted') {
      statusMapRef.current.clear();
      if (!isAuthenticated || !enabled) {
        void cancelAllDocuDashNotifications();
      }
      return;
    }

    let active = true;

    // Seed initial statuses & schedule reminders for active pickup slots.
    void listResidentRequests(userId)
      .then(async (rows) => {
        if (!active) return;
        const nextMap = new Map<string, RequestStatus>();
        for (const req of rows) {
          nextMap.set(req.id, req.status);
          if (
            req.pickup_slot &&
            (req.status === 'pending' || req.status === 'reviewing' || req.status === 'ready')
          ) {
            await schedulePickupReminder({
              requestId: req.id,
              documentName: req.document_type?.name ?? 'Barangay Document',
              slotDate: req.pickup_slot.slot_date,
              timeWindow: req.pickup_slot.time_window,
            });
          } else if (req.status === 'completed' || req.status === 'rejected') {
            await cancelPickupReminder(req.id);
          }
        }
        statusMapRef.current = nextMap;
      })
      .catch(() => {});

    const unsubscribeRealtime = subscribeToResidentRequests(userId, (payload) => {
      const newRecord = payload.new as Partial<{ id: string }>;
      const oldRecord = payload.old as Partial<{ id: string }>;
      const targetId = newRecord.id ?? oldRecord.id;
      if (!targetId || !active) return;

      if (payload.eventType === 'DELETE') {
        statusMapRef.current.delete(targetId);
        void cancelPickupReminder(targetId);
        return;
      }

      void getRequestById(targetId)
        .then(async (hydrated) => {
          if (!active || !hydrated) return;
          const prevStatus = statusMapRef.current.get(hydrated.id);
          statusMapRef.current.set(hydrated.id, hydrated.status);
          const docName = hydrated.document_type?.name ?? 'Barangay Document';

          if (
            prevStatus &&
            prevStatus !== hydrated.status &&
            hydrated.status !== 'pending'
          ) {
            await presentStatusChangeNotification({
              requestId: hydrated.id,
              documentName: docName,
              status: hydrated.status,
              rejectionReason: hydrated.rejection_reason,
            });
          }

          if (hydrated.status === 'completed' || hydrated.status === 'rejected') {
            await cancelPickupReminder(hydrated.id);
          } else if (hydrated.pickup_slot) {
            await schedulePickupReminder({
              requestId: hydrated.id,
              documentName: docName,
              slotDate: hydrated.pickup_slot.slot_date,
              timeWindow: hydrated.pickup_slot.time_window,
            });
          }
        })
        .catch(() => {});
    });

    return () => {
      active = false;
      unsubscribeRealtime();
    };
  }, [isSupported, isAuthenticated, isStaff, userId, enabled, permissionStatus]);

  // Open the target request tracker when a resident taps a DocuDash notification.
  useEffect(() => {
    if (!isSupported || !isAuthenticated || isStaff) {
      return;
    }

    return subscribeToNotificationTaps((requestId) => {
      router.push({
        pathname: '/(resident)/request/[id]',
        params: { id: requestId },
      });
    });
  }, [isSupported, isAuthenticated, isStaff]);

  const enableNotifications = useCallback(async (): Promise<NotificationPermissionStatus> => {
    if (!isSupported) return 'unsupported';
    setBusy(true);
    try {
      const status = await requestNotificationPermissions();
      setPermissionStatus(status);
      if (status === 'granted') {
        await setNotificationsEnabledPreference(true);
        setEnabled(true);
      }
      return status;
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const disableNotifications = useCallback(async (): Promise<void> => {
    if (!isSupported) return;
    setBusy(true);
    try {
      await setNotificationsEnabledPreference(false);
      await cancelAllDocuDashNotifications();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const sendTestAlert = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setBusy(true);
    try {
      const status = await requestNotificationPermissions();
      setPermissionStatus(status);
      if (status !== 'granted') {
        return false;
      }
      await setNotificationsEnabledPreference(true);
      setEnabled(true);
      return await sendTestNotification();
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        permissionStatus,
        enabled,
        busy,
        enableNotifications,
        disableNotifications,
        sendTestAlert,
        refreshPermissionStatus,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
