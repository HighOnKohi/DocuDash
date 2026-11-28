import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import { Button } from './Button';

export interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Scope & Data Controller',
    body: 'This Privacy Policy explains how DocuDash collects, stores, uses, and deletes your personal data in compliance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173). Personal records submitted through DocuDash are controlled by your participating Barangay Office.',
  },
  {
    title: '2. Personal Information & Files Collected',
    body: 'We collect only the details necessary to process barangay certificates: your full name, email address, Philippine mobile/landline number, barangay address, document request purpose, preferred pickup schedule, and uploaded supporting requirement IDs/files (JPEG, PNG, WebP, or PDF).',
  },
  {
    title: '3. Purpose of Processing',
    body: 'Your information is used strictly to verify residency and identity, review barangay document applications, reserve counter pickup slots, generate single-use QR pickup passes, and send status/pickup notifications.',
  },
  {
    title: '4. Private Storage, Access Controls & Audited Links',
    body: 'Uploaded IDs are stored in a private, encrypted bucket restricted by Row-Level Security (RLS). Barangay staff can preview your uploaded IDs only through temporary 60-second signed links, and every access or status change is recorded in an immutable audit log.',
  },
  {
    title: '5. 30-Day Retention & Automatic Purge',
    body: 'In accordance with RA 10173 storage-limitation principles, uploaded requirement files are automatically queued for permanent deletion 30 days after a document request is completed or rejected.',
  },
  {
    title: '6. Infrastructure & Sub-Processors',
    body: 'DocuDash does not sell personal data or use third-party advertising trackers. Core infrastructure uses Supabase (authentication, PostgreSQL database, private file storage), Vercel (API serverless routing), Gmail SMTP / Resend (transactional status emails), and PSGC Cloud API (Philippine address lookup without sending personal details).',
  },
  {
    title: '7. Mobile & Email Notifications',
    body: 'On the mobile app, DocuDash can show local status alerts and scheduled pickup slot reminders on your device when enabled. You may pause device alerts or turn off notification permissions at any time from Settings, your Profile screen, or your device OS settings.',
  },
  {
    title: '8. Your RA 10173 Rights & Account Deletion',
    body: 'You have the right to access, correct, and erase your personal data. Residents may update contact details or permanently delete their account and all uploaded ID files directly from Profile & Settings > Delete Account, or request assistance from the Barangay Office Data Protection Officer.',
  },
];

/**
 * Reusable modal presenting DocuDash's RA 10173 Privacy Policy across welcome,
 * registration, settings, and profile screens.
 */
export function PrivacyPolicyModal({
  visible,
  onClose,
  onAccept,
  showAcceptButton = false,
}: PrivacyPolicyModalProps) {
  const { colors, themeVars } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={themeVars}
        className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
      >
        <View className="max-h-[85%] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <MaterialIcons name="privacy-tip" size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">Privacy Policy</Text>
                <Text className="text-xs text-ink-subtle">RA 10173 Data Protection Notice</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close privacy policy"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" showsVerticalScrollIndicator>
            <View className="gap-4 pb-2">
              {PRIVACY_SECTIONS.map((section) => (
                <View key={section.title} className="gap-1">
                  <Text className="text-sm font-bold text-ink">{section.title}</Text>
                  <Text className="text-xs leading-5 text-ink-muted">{section.body}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View className="flex-row flex-wrap items-center justify-end gap-2.5 border-t border-border bg-surface-muted px-5 py-3.5">
            <Button label="Close" variant="outline" size="sm" onPress={onClose} />
            {showAcceptButton && onAccept ? (
              <Button
                label="I Understand & Consent"
                variant="primary"
                size="sm"
                icon="verified-user"
                onPress={onAccept}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
