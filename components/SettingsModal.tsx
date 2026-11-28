import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ComponentProps } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import type { ThemePreference } from '@/constants/theme';
import { useNotifications } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getPermissionEnableSteps } from '@/services/permissionService';

import { Button } from './Button';
import { PermissionsPromptModal } from './PermissionsPromptModal';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { TermsModal } from './TermsModal';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: MaterialIconName;
}[] = [
  { value: 'light', label: 'Light', icon: 'light-mode' },
  { value: 'dark', label: 'Dark', icon: 'dark-mode' },
  { value: 'system', label: 'System', icon: 'settings-brightness' },
];

export interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Settings modal allowing users across all screens (welcome, sign in,
 * resident, and admin) to switch Light / Dark / System theme and read
 * DocuDash Terms & Conditions.
 */
export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { preference, setPreference, colors, themeVars } = useTheme();
  const {
    isSupported,
    permissionStatus,
    enabled,
    busy,
    enableNotifications,
    disableNotifications,
  } = useNotifications();
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [permissionsVisible, setPermissionsVisible] = useState(false);

  const notificationsActive = isSupported && enabled && permissionStatus === 'granted';
  const notifGuide = getPermissionEnableSteps('notifications');

  async function handleToggleNotifications() {
    if (notificationsActive) {
      await disableNotifications();
    } else {
      await enableNotifications();
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="max-h-[88%] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                  <MaterialIcons name="tune" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text className="text-base font-bold text-ink">Settings</Text>
                  <Text className="text-xs text-ink-subtle">
                    Appearance, notifications &amp; legal
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                hitSlop={8}
                className="rounded-full p-1.5"
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator>
              <View className="gap-5 p-5">
                {/* Appearance selector */}
                <View className="gap-2.5">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Appearance
                  </Text>
                  <View className="flex-row gap-2">
                    {THEME_OPTIONS.map((option) => {
                      const active = preference === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setPreference(option.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Use ${option.label} theme`}
                          className={`flex-1 items-center gap-1.5 rounded-xl border py-3 ${
                            active
                              ? 'border-primary bg-primary-50'
                              : 'border-border bg-surface-muted'
                          }`}
                        >
                          <MaterialIcons
                            name={option.icon}
                            size={20}
                            color={active ? colors.primary : colors.inkMuted}
                          />
                          <Text
                            className={`text-xs font-semibold ${
                              active ? 'text-primary' : 'text-ink-muted'
                            }`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Mobile notifications */}
                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Notifications
                  </Text>
                  <View className="gap-3 rounded-xl border border-border bg-surface-muted p-3.5">
                    {isSupported ? (
                      <>
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1 flex-row items-center gap-2.5">
                            <MaterialIcons
                              name={
                                notificationsActive
                                  ? 'notifications-active'
                                  : 'notifications-off'
                              }
                              size={18}
                              color={notificationsActive ? colors.primary : colors.inkSubtle}
                            />
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-ink">
                                Device Status Alerts
                              </Text>
                              <Text className="text-[11px] leading-4 text-ink-subtle">
                                Local alerts &amp; pickup slot reminders
                              </Text>
                            </View>
                          </View>
                          <View
                            className={`rounded-full px-2.5 py-0.5 ${
                              notificationsActive
                                ? 'bg-emerald-100 dark:bg-emerald-950'
                                : permissionStatus === 'denied'
                                  ? 'bg-red-100 dark:bg-red-950'
                                  : 'bg-surface'
                            }`}
                          >
                            <Text
                              className={`text-[11px] font-bold ${
                                notificationsActive
                                  ? 'text-emerald-800 dark:text-emerald-300'
                                  : permissionStatus === 'denied'
                                    ? 'text-red-700 dark:text-red-300'
                                    : 'text-ink-muted'
                              }`}
                            >
                              {notificationsActive
                                ? 'Active'
                                : permissionStatus === 'denied'
                                  ? 'Blocked'
                                  : 'Paused'}
                            </Text>
                          </View>
                        </View>

                        {permissionStatus === 'denied' ? (
                          <View className="gap-2">
                            {notifGuide.steps.length > 0 ? (
                              <View className="gap-1 rounded-lg bg-surface p-2.5">
                                <Text className="text-[11px] font-bold text-ink">
                                  {notifGuide.heading}
                                </Text>
                                {notifGuide.steps.map((step, index) => (
                                  <Text key={step} className="text-[11px] leading-4 text-ink-muted">
                                    {index + 1}. {step}
                                  </Text>
                                ))}
                                {notifGuide.note ? (
                                  <Text className="mt-1 text-[10px] leading-4 text-ink-subtle">
                                    {notifGuide.note}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                            <Button
                              label="Open Device Settings"
                              size="sm"
                              variant="outline"
                              icon="open-in-new"
                              onPress={() => void Linking.openSettings()}
                              fullWidth
                            />
                          </View>
                        ) : (
                          <Button
                            label={notificationsActive ? 'Pause Device Alerts' : 'Enable Device Alerts'}
                            size="sm"
                            variant={notificationsActive ? 'outline' : 'primary'}
                            icon={notificationsActive ? 'notifications-off' : 'notifications'}
                            loading={busy}
                            onPress={() => void handleToggleNotifications()}
                            fullWidth
                          />
                        )}
                      </>
                    ) : (
                      <View className="flex-row items-start gap-2.5">
                        <MaterialIcons
                          name="notifications-none"
                          size={18}
                          color={colors.primary}
                          style={{ marginTop: 2 }}
                        />
                        <Text className="flex-1 text-xs leading-4 text-ink-muted">
                          Email alerts &amp; live status updates are active on web. Device alert
                          banners &amp; pickup reminders run on the Android/iOS mobile app.
                        </Text>
                      </View>
                    )}
                  </View>

                  {isSupported ? (
                    <Pressable
                      onPress={() => setPermissionsVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Open device permissions and instructions"
                      className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3"
                    >
                      <View className="flex-row items-center gap-3">
                        <MaterialIcons name="verified-user" size={18} color={colors.primary} />
                        <View>
                          <Text className="text-sm font-semibold text-ink">
                            Device Permissions &amp; Guide
                          </Text>
                          <Text className="text-[11px] text-ink-subtle">
                            Prompt alerts, camera access &amp; setup steps
                          </Text>
                        </View>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={colors.inkSubtle} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Legal & Privacy */}
                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Legal &amp; Privacy
                  </Text>
                  <Pressable
                    onPress={() => setPrivacyVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="View Privacy Policy"
                    className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3"
                  >
                    <View className="flex-row items-center gap-3">
                      <MaterialIcons name="privacy-tip" size={18} color={colors.primary} />
                      <View>
                        <Text className="text-sm font-semibold text-ink">Privacy Policy</Text>
                        <Text className="text-[11px] text-ink-subtle">
                          RA 10173 data handling &amp; your rights
                        </Text>
                      </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={colors.inkSubtle} />
                  </Pressable>
                  <Pressable
                    onPress={() => setTermsVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="View Terms and Conditions"
                    className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3"
                  >
                    <View className="flex-row items-center gap-3">
                      <MaterialIcons name="gavel" size={18} color={colors.primary} />
                      <View>
                        <Text className="text-sm font-semibold text-ink">
                          Terms &amp; Conditions
                        </Text>
                        <Text className="text-[11px] text-ink-subtle">
                          Portal guidelines &amp; 30-day retention
                        </Text>
                      </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={colors.inkSubtle} />
                  </Pressable>
                </View>

                <View className="gap-3 border-t border-border pt-3">
                  <Text className="text-[11px] leading-4 text-ink-subtle">
                    Need help with a request or account? Visit your Barangay Hall Office counter
                    with your request reference number.
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-ink-subtle">
                      DocuDash v1.0.0 · Barangay Services
                    </Text>
                    <Button label="Done" size="sm" variant="primary" onPress={onClose} />
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PermissionsPromptModal
        visible={permissionsVisible}
        onClose={() => setPermissionsVisible(false)}
        includeCamera
      />
      <PrivacyPolicyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </>
  );
}

export interface SettingsButtonProps {
  /** Render a compact icon-only or tight pill trigger for dense headers. */
  compact?: boolean;
  /** Stretch full-width (e.g. inside desktop sidebars). */
  fullWidth?: boolean;
}

/**
 * Self-contained Settings trigger pill + modal so any screen header can open
 * theme & legal preferences without duplicating modal state.
 */
export function SettingsButton({ compact = false, fullWidth = false }: SettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const { colors, isDark } = useTheme();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        className={`flex-row items-center justify-center gap-1.5 rounded-full border border-border bg-surface-muted ${
          compact ? 'px-3 py-1.5' : 'px-3.5 py-2'
        } ${fullWidth ? 'w-full rounded-lg' : 'self-start'}`}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        <MaterialIcons
          name={isDark ? 'dark-mode' : 'tune'}
          size={compact ? 16 : 18}
          color={colors.ink}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-ink`}>
          Settings
        </Text>
      </Pressable>

      <SettingsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
