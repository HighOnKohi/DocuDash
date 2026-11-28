import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import type { ThemePreference } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

import { Button } from './Button';
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
  const [termsVisible, setTermsVisible] = useState(false);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                  <MaterialIcons name="tune" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text className="text-base font-bold text-ink">Settings</Text>
                  <Text className="text-xs text-ink-subtle">Appearance &amp; legal information</Text>
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

              {/* Legal & Privacy */}
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  Legal &amp; Privacy
                </Text>
                <Pressable
                  onPress={() => setTermsVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="View Terms and Conditions"
                  className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3"
                >
                  <View className="flex-row items-center gap-3">
                    <MaterialIcons name="gavel" size={18} color={colors.primary} />
                    <View>
                      <Text className="text-sm font-semibold text-ink">Terms &amp; Conditions</Text>
                      <Text className="text-[11px] text-ink-subtle">
                        Portal guidelines &amp; RA 10173 retention
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.inkSubtle} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between border-t border-border pt-3">
                <Text className="text-xs text-ink-subtle">
                  DocuDash v1.0.0 · Barangay Document Services
                </Text>
                <Button label="Done" size="sm" variant="primary" onPress={onClose} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
