import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { formatDateTime } from '@/constants/format';
import { useNotifications } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { InAppNotificationItem } from '@/services/notificationService';

import { Button } from './Button';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

function getItemIcon(
  status: InAppNotificationItem['status'],
  colors: ReturnType<typeof useTheme>['colors']
): { icon: MaterialIconName; color: string } {
  switch (status) {
    case 'ready':
      return { icon: 'check-circle', color: colors.success };
    case 'completed':
      return { icon: 'verified', color: colors.primary };
    case 'rejected':
      return { icon: 'error-outline', color: colors.danger };
    case 'reviewing':
      return { icon: 'rate-review', color: colors.info };
  }
}

export interface NotificationInboxModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationInboxModal({ visible, onClose }: NotificationInboxModalProps) {
  const { colors, themeVars } = useTheme();
  const { alerts, unreadCount, markAlertRead, markAllAlertsRead, clearAlerts } =
    useNotifications();

  function handleOpenItem(item: InAppNotificationItem) {
    markAlertRead(item.id);
    onClose();
    if (item.requestId) {
      router.push({
        pathname: '/(resident)/request/[id]',
        params: { id: item.requestId },
      });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={themeVars}
        className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
      >
        <View className="max-h-[85%] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <MaterialIcons name="notifications" size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">App Notifications</Text>
                <Text className="text-xs text-ink-subtle">
                  {unreadCount > 0
                    ? `${unreadCount} unread status update${unreadCount === 1 ? '' : 's'}`
                    : 'Document status & pickup alerts'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator>
            <View className="gap-2.5 p-4">
              {alerts.length === 0 ? (
                <View className="items-center gap-2.5 py-8">
                  <MaterialIcons
                    name="notifications-none"
                    size={36}
                    color={colors.inkSubtle}
                  />
                  <Text className="text-sm font-bold text-ink">No alerts yet</Text>
                  <Text className="max-w-xs text-center text-xs leading-5 text-ink-muted">
                    When barangay staff mark your document Ready for Pickup or update your request,
                    alerts appear here automatically.
                  </Text>
                </View>
              ) : (
                alerts.map((item) => {
                  const meta = getItemIcon(item.status, colors);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => handleOpenItem(item)}
                      accessibilityRole="button"
                      className={`flex-row items-start gap-3 rounded-xl border p-3.5 ${
                        item.read
                          ? 'border-border bg-surface-muted'
                          : 'border-primary-200 bg-primary-50/70'
                      }`}
                    >
                      <MaterialIcons
                        name={meta.icon}
                        size={20}
                        color={meta.color}
                        style={{ marginTop: 2 }}
                      />
                      <View className="flex-1 gap-0.5">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="flex-1 text-sm font-bold text-ink">
                            {item.title}
                          </Text>
                          {!item.read ? (
                            <View className="h-2.5 w-2.5 rounded-full bg-primary" />
                          ) : null}
                        </View>
                        <Text className="text-xs leading-4 text-ink-muted">{item.body}</Text>
                        <Text className="mt-1 text-[11px] text-ink-subtle">
                          {formatDateTime(item.createdAt)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </ScrollView>

          <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-3">
            <View className="flex-row gap-2">
              {unreadCount > 0 ? (
                <Button
                  label="Mark All Read"
                  variant="ghost"
                  size="sm"
                  onPress={markAllAlertsRead}
                />
              ) : null}
              {alerts.length > 0 ? (
                <Button label="Clear" variant="ghost" size="sm" onPress={clearAlerts} />
              ) : null}
            </View>
            <Button label="Done" variant="primary" size="sm" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Compact header button showing unread notification count and opening the
 * resident notification inbox modal.
 */
export function NotificationBellButton() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { colors } = useTheme();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0
            ? `App notifications, ${unreadCount} unread`
            : 'Open app notifications'
        }
        className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5"
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        <MaterialIcons
          name={unreadCount > 0 ? 'notifications-active' : 'notifications-none'}
          size={17}
          color={unreadCount > 0 ? colors.primary : colors.ink}
        />
        {unreadCount > 0 ? (
          <View className="min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5">
            <Text className="text-[10px] font-extrabold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        ) : (
          <Text className="text-xs font-semibold text-ink">Alerts</Text>
        )}
      </Pressable>

      <NotificationInboxModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
