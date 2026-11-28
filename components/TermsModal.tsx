import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import { Button } from './Button';

export interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating a DocuDash account or submitting a barangay document request, you agree to abide by these Terms and Conditions and applicable Barangay Office guidelines.',
  },
  {
    title: '2. Accurate Resident Information & Valid IDs',
    body: 'You certify that all personal details (full name, barangay address, contact number) and uploaded identification documents are truthful, current, and legitimately yours. Submitting falsified records may result in rejection of your request and account suspension.',
  },
  {
    title: '3. Document Pre-Processing, Fees & Counter Pickup',
    body: 'Online submissions undergo staff verification prior to approval. Applicable barangay document fees shown in the portal are settled in person at the Barangay Hall counter upon pickup, unless otherwise specified for exempt certificates.',
  },
  {
    title: '4. QR Pickup Pass & Account Security',
    body: 'Your issued QR pickup pass is unique to your approved request. Keep your account credentials and QR code confidential and present a valid physical government or barangay ID when claiming your document.',
  },
  {
    title: '5. Data Privacy & 30-Day Retention (RA 10173)',
    body: 'Personal data and uploaded requirement files are processed solely for barangay document fulfillment in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). Uploaded requirement files are stored privately and automatically scheduled for deletion 30 days after request completion or rejection.',
  },
  {
    title: '6. Schedule & Policy Updates',
    body: 'Pickup schedules are subject to barangay office hours and slot capacity. The Barangay Office may update these Terms & Conditions as needed; continued use of DocuDash constitutes acceptance of updated terms.',
  },
];

/**
 * Reusable modal displaying DocuDash's Terms & Conditions for registration and
 * reference inside the Settings menu.
 */
export function TermsModal({
  visible,
  onClose,
  onAccept,
  showAcceptButton = false,
}: TermsModalProps) {
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
                <MaterialIcons name="description" size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">Terms &amp; Conditions</Text>
                <Text className="text-xs text-ink-subtle">DocuDash Barangay Portal</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close terms and conditions"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" showsVerticalScrollIndicator>
            <View className="gap-4 pb-2">
              {TERMS_SECTIONS.map((section) => (
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
                label="I Agree & Accept"
                variant="primary"
                size="sm"
                icon="check"
                onPress={onAccept}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
