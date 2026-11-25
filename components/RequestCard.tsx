import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, Text, View } from 'react-native';

import {
  formatDateTime,
  formatFee,
  formatSlotDate,
  formatTimeWindow,
} from '@/constants/format';
import { colors } from '@/constants/theme';
import type { RequestWithDetails } from '@/types/database';

import { StatusBadge } from './StatusBadge';

export interface RequestCardProps {
  request: RequestWithDetails;
  onPress: () => void;
}

export function RequestCard({ request, onPress }: RequestCardProps) {
  const documentName = request.document_type?.name ?? 'Barangay Document';
  const feeLabel = formatFee(request.document_type?.fee ?? 0);
  const slot = request.pickup_slot;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${documentName} request, status ${request.status}`}
      className="gap-3 rounded-card border border-border bg-surface p-4"
      style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-ink">{documentName}</Text>
          <Text className="text-xs font-medium text-ink-subtle">
            Fee: {feeLabel} · Submitted {formatDateTime(request.created_at)}
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      <Text className="text-sm leading-5 text-ink-muted" numberOfLines={2}>
        {request.purpose}
      </Text>

      <View className="flex-row items-center justify-between border-t border-border pt-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <MaterialIcons
            name={slot ? 'event-available' : 'event-busy'}
            size={16}
            color={slot ? colors.primary : colors.inkSubtle}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text className="flex-1 text-xs font-medium text-ink-muted" numberOfLines={1}>
            {slot
              ? `${formatSlotDate(slot.slot_date)} · ${formatTimeWindow(slot.time_window)}`
              : 'No pickup slot booked yet'}
          </Text>
        </View>

        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-semibold text-primary">
            {request.status === 'ready' ? 'View QR Pass' : 'Details'}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}
