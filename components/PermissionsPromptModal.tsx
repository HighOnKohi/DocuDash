import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useNotifications } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getCameraPermissionDetails,
  getNotificationPermissionStatusDetails,
  getPermissionEnableSteps,
  openDeviceAppSettings,
  requestCameraPermission,
  type DevicePermissionDetail,
} from '@/services/permissionService';

import { Button } from './Button';

export interface PermissionsPromptModalProps {
  visible: boolean;
  onClose: () => void;
  includeCamera?: boolean;
  showDismissForever?: boolean;
  onDismissForever?: () => void;
}

function StatusPill({ status }: { status: DevicePermissionDetail['status'] }) {
  const isGranted = status === 'granted';
  const isDenied = status === 'denied';
  return (
    <View
      className={`rounded-full px-2.5 py-0.5 ${isGranted
        ? 'bg-emerald-100 dark:bg-emerald-950'
        : isDenied
          ? 'bg-red-100 dark:bg-red-950'
          : 'bg-surface'
        }`}
    >
      <Text
        className={`text-[11px] font-bold ${isGranted
          ? 'text-emerald-800 dark:text-emerald-300'
          : isDenied
            ? 'text-red-700 dark:text-red-300'
            : 'text-ink-muted'
          }`}
      >
        {isGranted ? 'Allowed' : isDenied ? 'Blocked' : 'Not Enabled'}
      </Text>
    </View>
  );
}

function fetchPermissionSnapshot(includeCamera: boolean) {
  return Promise.all([
    getNotificationPermissionStatusDetails(),
    includeCamera
      ? getCameraPermissionDetails()
      : Promise.resolve<DevicePermissionDetail>({ status: 'unsupported', canAskAgain: false }),
  ]);
}

/**
 * Prompts mobile users to grant runtime device permissions (Notifications and,
 * for staff, Camera) and shows OS-specific settings instructions if denied.
 */
export function PermissionsPromptModal({
  visible,
  onClose,
  includeCamera = false,
  showDismissForever = false,
  onDismissForever,
}: PermissionsPromptModalProps) {
  const { colors, themeVars } = useTheme();
  const { enableNotifications, refreshPermissionStatus } = useNotifications();

  const [notifDetail, setNotifDetail] = useState<DevicePermissionDetail>({
    status: 'undetermined',
    canAskAgain: true,
  });
  const [cameraDetail, setCameraDetail] = useState<DevicePermissionDetail>({
    status: 'undetermined',
    canAskAgain: true,
  });
  const [notifBusy, setNotifBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [showNotifSteps, setShowNotifSteps] = useState(false);
  const [showCameraSteps, setShowCameraSteps] = useState(false);

  const applyPermissionResult = useCallback(
    async (notif: DevicePermissionDetail, cam: DevicePermissionDetail) => {
      setNotifDetail(notif);
      if (notif.status === 'denied') {
        setShowNotifSteps(true);
      }
      if (includeCamera) {
        setCameraDetail(cam);
        if (cam.status === 'denied') {
          setShowCameraSteps(true);
        }
      }
      await refreshPermissionStatus();
    },
    [includeCamera, refreshPermissionStatus]
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;

    const refresh = () =>
      fetchPermissionSnapshot(includeCamera)
        .then(([notif, cam]) => {
          if (!active) return;
          setNotifDetail(notif);
          if (notif.status === 'denied') {
            setShowNotifSteps(true);
          }
          if (includeCamera) {
            setCameraDetail(cam);
            if (cam.status === 'denied') {
              setShowCameraSteps(true);
            }
          }
          return refreshPermissionStatus();
        })
        .catch(() => { });

    void refresh();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && active) {
        void refresh();
      }
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [visible, includeCamera, refreshPermissionStatus]);

  async function handleAllowNotifications() {
    setNotifBusy(true);
    try {
      await enableNotifications();
      const [notif, cam] = await fetchPermissionSnapshot(includeCamera);
      await applyPermissionResult(notif, cam);
    } finally {
      setNotifBusy(false);
    }
  }

  async function handleAllowCamera() {
    setCameraBusy(true);
    try {
      await requestCameraPermission();
      const [notif, cam] = await fetchPermissionSnapshot(includeCamera);
      await applyPermissionResult(notif, cam);
    } finally {
      setCameraBusy(false);
    }
  }

  const notifGuide = getPermissionEnableSteps('notifications');
  const cameraGuide = getPermissionEnableSteps('camera');

  const notifGranted = notifDetail.status === 'granted';
  const notifBlocked = notifDetail.status === 'denied' || !notifDetail.canAskAgain;
  const cameraGranted = !includeCamera || cameraDetail.status === 'granted';
  const cameraBlocked = cameraDetail.status === 'denied' || !cameraDetail.canAskAgain;
  const allGranted = notifGranted && cameraGranted;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={themeVars}
        className="flex-1 items-center justify-center bg-black/65 px-4 py-6"
      >
        <View className="max-h-[88%] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <MaterialIcons name="verified-user" size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">Device Permissions</Text>
                <Text className="text-xs text-ink-subtle">
                  Enable alerts &amp; scanner access
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close permissions dialog"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator>
            <View className="gap-4 p-5">
              {/* Notifications card */}
              <View className="gap-3 rounded-xl border border-border bg-surface-muted p-4">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1 flex-row items-start gap-2.5">
                    <MaterialIcons
                      name={notifGranted ? 'notifications-active' : 'notifications'}
                      size={20}
                      color={notifGranted ? colors.success : colors.primary}
                      style={{ marginTop: 2 }}
                    />
                    <View className="flex-1 gap-0.5">
                      <Text className="text-sm font-bold text-ink">Notifications</Text>
                      <Text className="text-xs leading-4 text-ink-muted">
                        Alerts you when your document moves to Under Review or Ready for Pickup, and
                        reminds you before your booked pickup slot.
                      </Text>
                    </View>
                  </View>
                  <StatusPill status={notifDetail.status} />
                </View>

                {!notifGranted ? (
                  notifBlocked ? (
                    <Button
                      label="Open Device Settings"
                      variant="outline"
                      size="sm"
                      icon="open-in-new"
                      onPress={() => void openDeviceAppSettings()}
                      fullWidth
                    />
                  ) : (
                    <Button
                      label="Allow Notifications"
                      variant="primary"
                      size="sm"
                      icon="notifications"
                      loading={notifBusy}
                      onPress={() => void handleAllowNotifications()}
                      fullWidth
                    />
                  )
                ) : null}

                {notifGuide.steps.length > 0 && !notifGranted ? (
                  <View className="gap-2 border-t border-border pt-2.5">
                    <Pressable
                      onPress={() => setShowNotifSteps((prev) => !prev)}
                      accessibilityRole="button"
                      className="flex-row items-center justify-between"
                    >
                      <Text className="text-xs font-semibold text-primary">
                        {notifGuide.heading}
                      </Text>
                      <MaterialIcons
                        name={showNotifSteps ? 'expand-less' : 'expand-more'}
                        size={18}
                        color={colors.primary}
                      />
                    </Pressable>

                    {showNotifSteps ? (
                      <View className="gap-1.5">
                        {notifGuide.steps.map((step, index) => (
                          <Text key={step} className="text-xs leading-4 text-ink-muted">
                            {index + 1}. {step}
                          </Text>
                        ))}
                        {notifGuide.note ? (
                          <Text className="mt-1 rounded-lg bg-surface p-2.5 text-[11px] leading-4 text-ink-subtle">
                            {notifGuide.note}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Camera card (staff QR scanning) */}
              {includeCamera ? (
                <View className="gap-3 rounded-xl border border-border bg-surface-muted p-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1 flex-row items-start gap-2.5">
                      <MaterialIcons
                        name="qr-code-scanner"
                        size={20}
                        color={cameraGranted ? colors.success : colors.primary}
                        style={{ marginTop: 2 }}
                      />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-bold text-ink">Camera (QR Scanner)</Text>
                        <Text className="text-xs leading-4 text-ink-muted">
                          Used only when barangay staff open the QR Pickup Scanner to verify
                          resident pickup passes.
                        </Text>
                      </View>
                    </View>
                    <StatusPill status={cameraDetail.status} />
                  </View>

                  {!cameraGranted ? (
                    cameraBlocked ? (
                      <Button
                        label="Open Device Settings"
                        variant="outline"
                        size="sm"
                        icon="open-in-new"
                        onPress={() => void openDeviceAppSettings()}
                        fullWidth
                      />
                    ) : (
                      <Button
                        label="Allow Camera"
                        variant="primary"
                        size="sm"
                        icon="videocam"
                        loading={cameraBusy}
                        onPress={() => void handleAllowCamera()}
                        fullWidth
                      />
                    )
                  ) : null}

                  {cameraGuide.steps.length > 0 && !cameraGranted ? (
                    <View className="gap-2 border-t border-border pt-2.5">
                      <Pressable
                        onPress={() => setShowCameraSteps((prev) => !prev)}
                        accessibilityRole="button"
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-xs font-semibold text-primary">
                          {cameraGuide.heading}
                        </Text>
                        <MaterialIcons
                          name={showCameraSteps ? 'expand-less' : 'expand-more'}
                          size={18}
                          color={colors.primary}
                        />
                      </Pressable>

                      {showCameraSteps ? (
                        <View className="gap-1.5">
                          {cameraGuide.steps.map((step, index) => (
                            <Text key={step} className="text-xs leading-4 text-ink-muted">
                              {index + 1}. {step}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Text className="text-[11px] leading-4 text-ink-subtle">
                Privacy note: ID &amp; requirement uploads use your device&apos;s built-in file
                picker — DocuDash does not request broad storage or photo library permissions.
              </Text>
            </View>
          </ScrollView>

          <View className="flex-row flex-wrap items-center justify-end gap-2.5 border-t border-border bg-surface-muted px-5 py-3.5">
            {showDismissForever && onDismissForever && !allGranted ? (
              <Button
                label="Don't Ask Again"
                variant="outline"
                size="sm"
                onPress={onDismissForever}
              />
            ) : null}
            <Button
              label={allGranted ? 'Done' : 'Later'}
              variant={allGranted ? 'primary' : 'outline'}
              size="sm"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
