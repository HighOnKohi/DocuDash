import { router } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import {
  buildStatusNotificationCopy,
  cancelAllDocuDashNotifications,
  cancelPickupReminder,
  configureNotificationHandler,
  getNotificationPermissionStatus,
  getNotificationsEnabledPreference,
  getWebNotificationPermission,
  isNativeNotificationsSupported,
  isWebNotificationsSupported,
  loadKnownRequestStatuses,
  loadNotificationInbox,
  presentStatusChangeNotification,
  presentWebStatusNotification,
  registerExpoPushTokenForUser,
  requestNotificationPermissions,
  requestWebNotificationPermission,
  saveKnownRequestStatuses,
  saveNotificationInbox,
  schedulePickupReminder,
  sendTestNotification,
  setNotificationsEnabledPreference,
  subscribeToNotificationTaps,
  unregisterExpoPushToken,
  type InAppNotificationItem,
  type NotificationPermissionStatus,
  type StatusNotificationInput,
} from '@/services/notificationService';
import {
  getRequestById,
  listResidentRequests,
  subscribeToResidentRequests,
} from '@/services/requestService';
import type { DocumentRequest, RequestStatus, RequestWithDetails } from '@/types/database';

const RESYNC_INTERVAL_MS = 15_000;
const BANNER_AUTO_DISMISS_MS = 8_000;
const MAX_INBOX_ITEMS = 30;

export interface NotificationContextValue {
  isSupported: boolean;
  webNotificationsSupported: boolean;
  permissionStatus: NotificationPermissionStatus;
  webPermissionStatus: NotificationPermissionStatus;
  enabled: boolean;
  busy: boolean;
  alerts: InAppNotificationItem[];
  unreadCount: number;
  activeBanner: InAppNotificationItem | null;
  dismissBanner: () => void;
  markAlertRead: (alertId: string) => void;
  markAllAlertsRead: () => void;
  clearAlerts: () => void;
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
  const webNotificationsSupported = isWebNotificationsSupported();
  const { user, isAuthenticated, isStaff, isAppManager } = useAuth();
  const userId = user?.id ?? null;

  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(
    isSupported ? 'undetermined' : 'unsupported'
  );
  const [webPermissionStatus, setWebPermissionStatus] = useState<NotificationPermissionStatus>(() =>
    getWebNotificationPermission()
  );
  const [enabled, setEnabled] = useState<boolean>(isSupported || webNotificationsSupported);
  const [busy, setBusy] = useState(false);

  const [alerts, setAlerts] = useState<InAppNotificationItem[]>([]);
  const [activeBanner, setActiveBanner] = useState<InAppNotificationItem | null>(null);

  const knownStatusesRef = useRef<Record<string, RequestStatus>>({});
  const hadSnapshotRef = useRef<boolean>(false);
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const alertsRef = useRef<InAppNotificationItem[]>([]);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabledRef = useRef(enabled);
  const nativePermRef = useRef(permissionStatus);
  const webPermRef = useRef(webPermissionStatus);
  const userIdRef = useRef(userId);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    nativePermRef.current = permissionStatus;
  }, [permissionStatus]);

  useEffect(() => {
    webPermRef.current = webPermissionStatus;
  }, [webPermissionStatus]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const showFloatingBanner = useCallback((item: InAppNotificationItem) => {
    setActiveBanner(item);
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = setTimeout(() => {
      setActiveBanner((current) => (current?.id === item.id ? null : current));
    }, BANNER_AUTO_DISMISS_MS);
  }, []);

  const dismissBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    setActiveBanner(null);
  }, []);

  const updateAlertsState = useCallback(
    (updater: (prev: InAppNotificationItem[]) => InAppNotificationItem[]) => {
      setAlerts((prev) => {
        const next = updater(prev).slice(0, MAX_INBOX_ITEMS);
        alertsRef.current = next;
        const uid = userIdRef.current;
        if (uid) {
          void saveNotificationInbox(uid, next);
        }
        return next;
      });
    },
    []
  );

  const markAlertRead = useCallback(
    (alertId: string) => {
      updateAlertsState((prev) =>
        prev.map((item) => (item.id === alertId ? { ...item, read: true } : item))
      );
    },
    [updateAlertsState]
  );

  const markAllAlertsRead = useCallback(() => {
    updateAlertsState((prev) => prev.map((item) => ({ ...item, read: true })));
  }, [updateAlertsState]);

  const clearAlerts = useCallback(() => {
    updateAlertsState(() => []);
  }, [updateAlertsState]);

  const dispatchAlertForTransition = useCallback(
    async (
      input: StatusNotificationInput,
      options: { showBannerAndDeviceAlert: boolean }
    ) => {
      const dedupeKey = `${input.requestId}:${input.status}`;
      if (notifiedKeysRef.current.has(dedupeKey)) {
        return;
      }
      notifiedKeysRef.current.add(dedupeKey);

      const { title, body } = buildStatusNotificationCopy(input);
      const item: InAppNotificationItem = {
        id: `${dedupeKey}:${Date.now()}`,
        requestId: input.requestId,
        documentName: input.documentName,
        status: input.status,
        title,
        body,
        createdAt: new Date().toISOString(),
        read: false,
      };

      updateAlertsState((prev) => {
        if (prev.some((existing) => existing.id.startsWith(`${dedupeKey}:`))) {
          return prev;
        }
        return [item, ...prev];
      });

      if (!options.showBannerAndDeviceAlert) {
        return;
      }

      showFloatingBanner(item);

      if (isSupported && enabledRef.current && nativePermRef.current === 'granted') {
        await presentStatusChangeNotification(input).catch(() => {});
      } else if (
        webNotificationsSupported &&
        enabledRef.current &&
        webPermRef.current === 'granted'
      ) {
        presentWebStatusNotification(input, (reqId) => {
          router.push({
            pathname: '/(resident)/request/[id]',
            params: { id: reqId },
          });
        });
      }
    },
    [isSupported, showFloatingBanner, updateAlertsState, webNotificationsSupported]
  );

  const refreshPermissionStatus = useCallback(async () => {
    if (isSupported) {
      const status = await getNotificationPermissionStatus();
      setPermissionStatus(status);
    } else if (webNotificationsSupported) {
      setWebPermissionStatus(getWebNotificationPermission());
    }
  }, [isSupported, webNotificationsSupported]);

  // Configure foreground notification handler & load stored preferences on mount.
  useEffect(() => {
    configureNotificationHandler();
    let active = true;

    void (async () => {
      const [storedEnabled, nativeStatus] = await Promise.all([
        getNotificationsEnabledPreference(),
        isSupported
          ? getNotificationPermissionStatus()
          : Promise.resolve<NotificationPermissionStatus>('unsupported'),
      ]);
      if (!active) return;
      setEnabled(storedEnabled);
      setPermissionStatus(nativeStatus);
      if (webNotificationsSupported) {
        setWebPermissionStatus(getWebNotificationPermission());
      }
    })();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && active) {
        if (isSupported) {
          void getNotificationPermissionStatus().then((osStatus) => {
            if (active) setPermissionStatus(osStatus);
          });
        } else if (webNotificationsSupported) {
          setWebPermissionStatus(getWebNotificationPermission());
        }
      }
    });

    return () => {
      active = false;
      appStateSub.remove();
    };
  }, [isSupported, webNotificationsSupported]);

  // Register/unregister device Expo push token for resident push delivery.
  useEffect(() => {
    if (!isSupported) return;

    if (
      !isAuthenticated ||
      isStaff ||
      isAppManager ||
      !userId ||
      !enabled ||
      permissionStatus !== 'granted'
    ) {
      if (!isAuthenticated || !enabled) {
        void unregisterExpoPushToken();
      }
      return;
    }

    void registerExpoPushTokenForUser(userId);
  }, [isSupported, isAuthenticated, isStaff, isAppManager, userId, enabled, permissionStatus]);

  // Core resident request monitor:
  // 1) Persists known statuses & inbox in AsyncStorage across app restarts
  // 2) Subscribes to Supabase Realtime with payload.new fallback
  // 3) Re-syncs on foreground resume, web tab visibility, and 15s failsafe interval
  useEffect(() => {
    if (!isAuthenticated || isStaff || isAppManager || !userId) {
      knownStatusesRef.current = {};
      hadSnapshotRef.current = false;
      notifiedKeysRef.current.clear();
      alertsRef.current = [];
      if (!isAuthenticated && isSupported) {
        void cancelAllDocuDashNotifications();
      }
      return;
    }

    let active = true;

    const reconcileHydratedRows = async (rows: RequestWithDetails[]) => {
      if (!active) return;
      const hadSnapshot = hadSnapshotRef.current;

      for (const req of rows) {
        const prevStatus = knownStatusesRef.current[req.id];
        knownStatusesRef.current[req.id] = req.status;
        const docName = req.document_type?.name ?? 'Barangay Document';

        if (hadSnapshot) {
          if (prevStatus !== req.status && req.status !== 'pending') {
            await dispatchAlertForTransition(
              {
                requestId: req.id,
                documentName: docName,
                status: req.status,
                rejectionReason: req.rejection_reason,
              },
              { showBannerAndDeviceAlert: true }
            );
          }
        } else if (req.status === 'ready') {
          // First session seed on this device: surface already-ready documents
          // in the notification inbox & banner so nothing is overlooked.
          await dispatchAlertForTransition(
            {
              requestId: req.id,
              documentName: docName,
              status: 'ready',
              rejectionReason: req.rejection_reason,
            },
            { showBannerAndDeviceAlert: true }
          );
        }

        if (isSupported && enabledRef.current && nativePermRef.current === 'granted') {
          if (req.status === 'completed' || req.status === 'rejected') {
            await cancelPickupReminder(req.id);
          } else if (req.pickup_slot) {
            await schedulePickupReminder({
              requestId: req.id,
              documentName: docName,
              slotDate: req.pickup_slot.slot_date,
              timeWindow: req.pickup_slot.time_window,
            });
          }
        }
      }

      hadSnapshotRef.current = true;
      await saveKnownRequestStatuses(userId, knownStatusesRef.current);
    };

    const syncResidentRequests = async () => {
      if (!active) return;
      try {
        const rows = await listResidentRequests(userId);
        if (!active) return;
        await reconcileHydratedRows(rows);
      } catch {
        // Transient network issue; next interval/AppState resume will retry cleanly.
      }
    };

    void (async () => {
      const [persistedStatuses, persistedInbox] = await Promise.all([
        loadKnownRequestStatuses(userId),
        loadNotificationInbox(userId),
      ]);
      if (!active) return;

      if (persistedStatuses) {
        knownStatusesRef.current = persistedStatuses;
        hadSnapshotRef.current = true;
      } else {
        knownStatusesRef.current = {};
        hadSnapshotRef.current = false;
      }

      const seededKeys = new Set<string>();
      for (const existing of persistedInbox) {
        seededKeys.add(`${existing.requestId}:${existing.status}`);
      }
      notifiedKeysRef.current = seededKeys;
      alertsRef.current = persistedInbox;
      setAlerts(persistedInbox);

      await syncResidentRequests();
    })();

    const unsubscribeRealtime = subscribeToResidentRequests(userId, (payload) => {
      const newRecord = payload.new as Partial<DocumentRequest>;
      const oldRecord = payload.old as Partial<DocumentRequest>;
      const targetId = newRecord.id ?? oldRecord.id;
      if (!targetId || !active) return;

      if (payload.eventType === 'DELETE') {
        delete knownStatusesRef.current[targetId];
        void saveKnownRequestStatuses(userId, knownStatusesRef.current);
        void cancelPickupReminder(targetId);
        return;
      }

      void getRequestById(targetId)
        .then(async (hydrated) => {
          if (!active) return;
          if (hydrated) {
            await reconcileHydratedRows([hydrated]);
            return;
          }
          // Fallback directly to payload.new if hydrated select returns null.
          if (newRecord.status && newRecord.status !== 'pending') {
            const prevStatus = knownStatusesRef.current[targetId];
            if (prevStatus !== newRecord.status) {
              knownStatusesRef.current[targetId] = newRecord.status;
              hadSnapshotRef.current = true;
              await saveKnownRequestStatuses(userId, knownStatusesRef.current);
              await dispatchAlertForTransition(
                {
                  requestId: targetId,
                  documentName: 'Barangay Document',
                  status: newRecord.status,
                  rejectionReason: newRecord.rejection_reason,
                },
                { showBannerAndDeviceAlert: true }
              );
            }
          }
        })
        .catch(async () => {
          if (!active) return;
          if (newRecord.status && newRecord.status !== 'pending') {
            const prevStatus = knownStatusesRef.current[targetId];
            if (prevStatus !== newRecord.status) {
              knownStatusesRef.current[targetId] = newRecord.status;
              hadSnapshotRef.current = true;
              await saveKnownRequestStatuses(userId, knownStatusesRef.current);
              await dispatchAlertForTransition(
                {
                  requestId: targetId,
                  documentName: 'Barangay Document',
                  status: newRecord.status,
                  rejectionReason: newRecord.rejection_reason,
                },
                { showBannerAndDeviceAlert: true }
              );
            }
          }
        });
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && active) {
        void syncResidentRequests();
      }
    });

    const handleVisibilityChange = () => {
      if (
        Platform.OS === 'web' &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        active
      ) {
        void syncResidentRequests();
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const pollInterval = setInterval(() => {
      if (active) {
        void syncResidentRequests();
      }
    }, RESYNC_INTERVAL_MS);

    return () => {
      active = false;
      unsubscribeRealtime();
      appStateSub.remove();
      clearInterval(pollInterval);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [
    isAuthenticated,
    isStaff,
    isAppManager,
    userId,
    isSupported,
    dispatchAlertForTransition,
  ]);

  // Open the target request tracker when a resident taps a native DocuDash notification.
  useEffect(() => {
    if (!isSupported || !isAuthenticated || isStaff || isAppManager) {
      return;
    }

    return subscribeToNotificationTaps((requestId) => {
      router.push({
        pathname: '/(resident)/request/[id]',
        params: { id: requestId },
      });
    });
  }, [isSupported, isAuthenticated, isStaff, isAppManager]);

  const enableNotifications = useCallback(async (): Promise<NotificationPermissionStatus> => {
    if (webNotificationsSupported && !isSupported) {
      setBusy(true);
      try {
        const status = await requestWebNotificationPermission();
        setWebPermissionStatus(status);
        if (status === 'granted') {
          await setNotificationsEnabledPreference(true);
          setEnabled(true);
        }
        return status;
      } finally {
        setBusy(false);
      }
    }

    if (!isSupported) return 'unsupported';
    setBusy(true);
    try {
      const status = await requestNotificationPermissions();
      setPermissionStatus(status);
      if (status === 'granted') {
        await setNotificationsEnabledPreference(true);
        setEnabled(true);
        if (userId && !isStaff && !isAppManager) {
          void registerExpoPushTokenForUser(userId);
        }
      }
      return status;
    } finally {
      setBusy(false);
    }
  }, [isAppManager, isStaff, isSupported, userId, webNotificationsSupported]);

  const disableNotifications = useCallback(async (): Promise<void> => {
    if (!isSupported && !webNotificationsSupported) return;
    setBusy(true);
    try {
      await setNotificationsEnabledPreference(false);
      await cancelAllDocuDashNotifications();
      await unregisterExpoPushToken();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [isSupported, webNotificationsSupported]);

  const sendTestAlert = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const testBanner: InAppNotificationItem = {
        id: `test-${Date.now()}`,
        requestId: '',
        documentName: 'DocuDash Test',
        status: 'ready',
        title: 'DocuDash Alerts Active',
        body: 'In-app & device Ready for Pickup alerts are working on this device.',
        createdAt: new Date().toISOString(),
        read: true,
      };
      showFloatingBanner(testBanner);

      if (webNotificationsSupported && !isSupported) {
        const status = await requestWebNotificationPermission();
        setWebPermissionStatus(status);
        if (status !== 'granted') return true;
        await setNotificationsEnabledPreference(true);
        setEnabled(true);
        await sendTestNotification();
        return true;
      }

      if (!isSupported) return true;
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
  }, [isSupported, showFloatingBanner, webNotificationsSupported]);

  const unreadCount = useMemo(
    () => (isAuthenticated && !isStaff && !isAppManager ? alerts.filter((a) => !a.read).length : 0),
    [alerts, isAppManager, isAuthenticated, isStaff]
  );

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        webNotificationsSupported,
        permissionStatus,
        webPermissionStatus,
        enabled,
        busy,
        alerts: isAuthenticated && !isStaff && !isAppManager ? alerts : [],
        unreadCount,
        activeBanner: isAuthenticated && !isStaff && !isAppManager ? activeBanner : null,
        dismissBanner,
        markAlertRead,
        markAllAlertsRead,
        clearAlerts,
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
