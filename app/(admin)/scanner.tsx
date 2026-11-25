import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { QrScannerView } from '@/components/QrScannerView';
import { Banner, EmptyState } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import {
  formatDateTime,
  formatFee,
  formatSlotDate,
  formatTimeWindow,
} from '@/constants/format';
import { colors } from '@/constants/theme';
import { verifyPickupByQrToken } from '@/services/requestService';
import { toServiceError } from '@/services/supabase';
import type { VerifyPickupResponse } from '@/types/database';

export default function AdminScannerScreen() {
  const [cameraActive, setCameraActive] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastVerified, setLastVerified] = useState<VerifyPickupResponse | null>(null);
  const [sessionHistory, setSessionHistory] = useState<VerifyPickupResponse[]>([]);

  const handleVerifyToken = useCallback(async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token) {
      setScanError('Enter or scan a QR pickup token.');
      return;
    }

    setVerifying(true);
    setScanError(null);

    try {
      const receipt = await verifyPickupByQrToken(token);
      setLastVerified(receipt);
      setSessionHistory((prev) => [
        receipt,
        ...prev.filter((item) => item.request.id !== receipt.request.id),
      ]);
      setManualToken('');
      // Pause camera after a verified release so the clerk can inspect the receipt.
      setCameraActive(false);
    } catch (error) {
      setScanError(toServiceError(error, 'Unable to verify pickup pass.').message);
    } finally {
      setVerifying(false);
    }
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{ padding: 24, paddingBottom: 44 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mx-auto w-full max-w-6xl gap-6">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">QR Pickup Verification Scanner</Text>
          <Text className="text-sm text-ink-muted">
            Verify a resident&apos;s QR pass via `/api/verify-pickup` to mark the request completed
            and log the release.
          </Text>
        </View>

        <View className="gap-6 lg:flex-row lg:items-start">
          {/* Left column: Camera + Manual entry */}
          <View className="flex-1 gap-6">
            <Card
              title="Camera Scanner"
              subtitle="Uses device camera on mobile or browser webcam on desktop."
            >
              <QrScannerView
                active={cameraActive}
                paused={verifying}
                onScan={(value) => {
                  setManualToken(value);
                  void handleVerifyToken(value);
                }}
                onToggleActive={setCameraActive}
              />
            </Card>

            <Card
              title="Manual Token Verification"
              subtitle="Paste a 43-character pickup token or scan with a USB barcode reader."
            >
              <View className="gap-4">
                <TextField
                  label="QR pickup token"
                  value={manualToken}
                  onChangeText={setManualToken}
                  placeholder="Paste QR token here..."
                  autoCapitalize="none"
                  editable={!verifying}
                />
                <Button
                  label={verifying ? 'Verifying Pass...' : 'Verify & Release Document'}
                  icon="verified"
                  loading={verifying}
                  disabled={!manualToken.trim()}
                  onPress={() => void handleVerifyToken(manualToken)}
                  fullWidth
                />
              </View>
            </Card>
          </View>

          {/* Right column: Verification receipt + session history */}
          <View className="flex-1 gap-6">
            {scanError ? (
              <Banner
                tone="error"
                title="Verification Rejected"
                message={scanError}
                actionLabel="Clear Error"
                onAction={() => setScanError(null)}
              />
            ) : null}

            {lastVerified ? (
              <Card
                title="Pickup Verified & Completed"
                subtitle={`Released on ${formatDateTime(lastVerified.request.completed_at)}`}
                rightSlot={
                  <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                    <Text className="text-xs font-bold text-emerald-800">VERIFIED</Text>
                  </View>
                }
              >
                <View className="gap-4">
                  <Banner
                    tone="success"
                    message="This QR pass has been atomically claimed and recorded in the immutable audit log. Collect any applicable fee and hand over the document."
                  />

                  <View className="gap-2.5 rounded-lg border border-border bg-surface-muted p-4">
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Resident</Text>
                      <Text className="text-sm font-bold text-ink">
                        {lastVerified.resident.full_name}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Contact</Text>
                      <Text className="text-xs font-semibold text-ink">
                        {lastVerified.resident.contact_number}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Address</Text>
                      <Text className="max-w-[65%] text-right text-xs font-medium text-ink">
                        {lastVerified.resident.address}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2 border-t border-border pt-2">
                      <Text className="text-xs text-ink-subtle">Document</Text>
                      <Text className="text-sm font-bold text-ink">
                        {lastVerified.documentType.name}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Fee Due</Text>
                      <Text className="text-sm font-bold text-primary">
                        {formatFee(lastVerified.documentType.fee)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Scheduled Slot</Text>
                      <Text className="text-xs font-semibold text-ink">
                        {lastVerified.pickupSlot
                          ? `${formatSlotDate(lastVerified.pickupSlot.slot_date)} · ${formatTimeWindow(lastVerified.pickupSlot.time_window)}`
                          : 'Walk-in / no slot'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      label="Scan Next Pass"
                      icon="qr-code-scanner"
                      size="sm"
                      onPress={() => {
                        setLastVerified(null);
                        setScanError(null);
                        setCameraActive(true);
                      }}
                    />
                    <Button
                      label="Open Request Record"
                      variant="outline"
                      size="sm"
                      icon="open-in-new"
                      onPress={() =>
                        router.push({
                          pathname: '/(admin)/requests/[id]',
                          params: { id: lastVerified.request.id },
                        })
                      }
                    />
                  </View>
                </View>
              </Card>
            ) : (
              <EmptyState
                icon="qr-code-2"
                title="Ready to verify a pickup pass"
                description="Scan a resident's QR pass or enter their pickup token on the left. Verified release receipts will appear here."
              />
            )}

            {sessionHistory.length > 0 ? (
              <Card
                title="Verified This Session"
                subtitle={`${sessionHistory.length} ${sessionHistory.length === 1 ? 'document' : 'documents'} released`}
              >
                <View className="gap-2.5">
                  {sessionHistory.map((item) => (
                    <Pressable
                      key={item.request.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(admin)/requests/[id]',
                          params: { id: item.request.id },
                        })
                      }
                      className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5"
                    >
                      <View className="flex-1 gap-0.5">
                        <Text className="text-xs font-bold text-ink">
                          {item.documentType.name} — {item.resident.full_name}
                        </Text>
                        <Text className="text-[11px] text-ink-subtle">
                          Released {formatDateTime(item.request.completed_at)} ·{' '}
                          {formatFee(item.documentType.fee)}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            ) : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
