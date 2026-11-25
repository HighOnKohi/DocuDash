import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { colors } from '@/constants/theme';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string | null;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  editable?: boolean;
  required?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  secureTextEntry = false,
  multiline = false,
  numberOfLines = 1,
  maxLength,
  keyboardType,
  autoCapitalize = 'sentences',
  autoComplete,
  editable = true,
  required = false,
}: TextFieldProps) {
  const [isHidden, setIsHidden] = useState(secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);

  const borderClass = error
    ? 'border-primary'
    : isFocused
      ? 'border-primary'
      : 'border-border-strong';

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-ink">
          {label}
          {required ? <Text className="text-primary"> *</Text> : null}
        </Text>
        {maxLength ? (
          <Text className="text-xs text-ink-subtle">
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>

      <View
        className={`flex-row items-center rounded-lg border bg-surface px-3.5 ${borderClass} ${
          editable ? '' : 'bg-surface-muted opacity-80'
        }`}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSubtle}
          secureTextEntry={secureTextEntry ? isHidden : false}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
          className={`flex-1 py-3 text-base text-ink ${multiline ? 'min-h-[104px]' : 'min-h-[44px]'}`}
          accessibilityLabel={label}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsHidden((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={isHidden ? 'Show password' : 'Hide password'}
            className="ml-2 p-1"
            hitSlop={8}
          >
            <MaterialIcons
              name={isHidden ? 'visibility' : 'visibility-off'}
              size={20}
              color={colors.inkSubtle}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text className="text-xs font-medium text-primary">{error}</Text>
      ) : helperText ? (
        <Text className="text-xs text-ink-subtle">{helperText}</Text>
      ) : null}
    </View>
  );
}
