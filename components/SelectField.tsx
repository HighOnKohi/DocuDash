import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { useTheme } from '@/contexts/ThemeContext';

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

export interface SelectFieldProps {
  label: string;
  placeholder: string;
  value: string | null;
  displayValue?: string;
  options: SelectOption[];
  onSelect: (option: SelectOption) => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onRetry?: () => void;
}

/**
 * Searchable banking-app dropdown trigger and modal picker styled to match
 * DocuDash's soft-filled inputs and adaptive light/dark theme.
 */
export function SelectField({
  label,
  placeholder,
  value,
  displayValue,
  options,
  onSelect,
  loading = false,
  disabled = false,
  error = null,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No matching locations found.',
  onRetry,
}: SelectFieldProps) {
  const { colors, themeVars } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(normalized) ||
        (opt.subtitle?.toLowerCase().includes(normalized) ?? false)
    );
  }, [options, query]);

  const isTriggerDisabled = disabled && !error;
  const resolvedText =
    displayValue ?? options.find((opt) => opt.value === value)?.label ?? '';

  function handleClose() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(option: SelectOption) {
    onSelect(option);
    handleClose();
  }

  return (
    <>
      <Pressable
        onPress={() => {
          if (!isTriggerDisabled) {
            setQuery('');
            setOpen(true);
          }
        }}
        disabled={isTriggerDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isTriggerDisabled, expanded: open }}
        className={`flex-row items-center justify-between rounded-2xl border bg-surface-input px-4 py-3 ${
          error ? 'border-red-600 dark:border-red-500' : open ? 'border-primary' : 'border-transparent'
        } ${isTriggerDisabled ? 'opacity-50' : ''}`}
        style={({ pressed }) => (pressed && !isTriggerDisabled ? { opacity: 0.9 } : undefined)}
      >
        <View className="flex-1 pr-2">
          <Text className="text-xs font-semibold text-primary">{label}</Text>
          <Text
            numberOfLines={1}
            className={`mt-1 min-h-[24px] text-base font-medium ${
              resolvedText ? 'text-ink' : 'text-ink-subtle'
            }`}
          >
            {loading && !resolvedText ? 'Loading...' : resolvedText || placeholder}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialIcons
            name="keyboard-arrow-down"
            size={22}
            color={colors.inkMuted}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="h-[75%] max-h-[600px] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-base font-bold text-ink">{label}</Text>
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={`Close ${label} selector`}
                hitSlop={8}
                className="rounded-full p-1"
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            {/* Search bar */}
            <View className="border-b border-border px-4 py-3">
              <View className="flex-row items-center gap-2 rounded-xl bg-surface-input px-3.5 py-2.5">
                <MaterialIcons name="search" size={18} color={colors.inkSubtle} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.inkSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-[24px] flex-1 p-0 text-sm text-ink"
                  accessibilityLabel={`Search ${label}`}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={colors.inkSubtle} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Body */}
            {error ? (
              <View className="flex-1 items-center justify-center gap-3 px-6 py-8">
                <MaterialIcons name="cloud-off" size={32} color={colors.danger} />
                <Text className="text-center text-sm text-ink-muted">{error}</Text>
                {onRetry ? (
                  <Button label="Retry" size="sm" variant="outline" onPress={onRetry} />
                ) : null}
              </View>
            ) : loading ? (
              <View className="flex-1 items-center justify-center gap-3 px-6 py-8">
                <ActivityIndicator size="large" color={colors.primary} />
                <Text className="text-sm text-ink-muted">Loading Philippine locations...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredOptions}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                contentContainerStyle={
                  filteredOptions.length === 0 ? { flexGrow: 1 } : { paddingVertical: 6 }
                }
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center px-6 py-10">
                    <Text className="text-center text-sm text-ink-muted">{emptyMessage}</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const selected = item.value === value;
                  return (
                    <Pressable
                      onPress={() => handleSelect(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`mx-2 my-0.5 flex-row items-center justify-between rounded-xl px-3.5 py-3 ${
                        selected ? 'bg-primary-50' : 'bg-transparent'
                      }`}
                    >
                      <View className="flex-1 pr-2">
                        <Text
                          className={`text-sm font-semibold ${
                            selected ? 'text-primary' : 'text-ink'
                          }`}
                        >
                          {item.label}
                        </Text>
                        {item.subtitle ? (
                          <Text className="text-xs text-ink-subtle">{item.subtitle}</Text>
                        ) : null}
                      </View>
                      {selected ? (
                        <MaterialIcons name="check" size={18} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
