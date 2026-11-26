import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { toServiceError } from '@/services/supabase';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, configError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email, password });
      // Root layout's Stack.Protected redirects automatically based on profile.role.
    } catch (error) {
      setErrorMessage(toServiceError(error, 'Unable to sign in. Please check your credentials.').message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-muted"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
          justifyContent: 'center',
        }}
      >
        <View className="mx-auto w-full max-w-md gap-6">
          <Pressable
            onPress={() => router.replace('/(auth)')}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            className="flex-row items-center gap-1.5 self-start py-1"
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.inkMuted} />
            <Text className="text-sm font-medium text-ink-muted">Back to overview</Text>
          </Pressable>

          <BrandMark />

          {configError ? <Banner tone="warning" message={configError} /> : null}

          <Card
            title="Sign in to DocuDash"
            subtitle="Access your resident requests or the barangay staff portal."
          >
            <View className="gap-4">
              {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

              <TextField
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="juan.delacruz@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!submitting}
                required
              />

              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!submitting}
                required
              />

              <View className="pt-1">
                <Button
                  label="Sign In"
                  icon="login"
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={Boolean(configError)}
                  fullWidth
                />
              </View>
            </View>
          </Card>

          <View className="flex-row items-center justify-center gap-1.5">
            <Text className="text-sm text-ink-muted">New resident?</Text>
            <Link href="/(auth)/register" asChild>
              <Pressable hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">Create an account</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
