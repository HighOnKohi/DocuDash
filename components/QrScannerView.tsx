import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Banner } from '@/components/StateView';
import { useTheme } from '@/contexts/ThemeContext';

export interface QrScannerViewProps {
  /** Whether the camera preview and QR decoding are actively running. */
  active: boolean;
  /** Pauses decoding while a scanned token is being verified on the server. */
  paused: boolean;
  onScan: (rawValue: string) => void;
  onToggleActive: (nextActive: boolean) => void;
}

/**
 * Native (iOS / Android) QR scanner powered by `expo-camera`'s `CameraView`.
 * Web uses the sibling `QrScannerView.web.tsx` implementation.
 */
export function QrScannerView({
  active,
  paused,
  onScan,
  onToggleActive,
}: QrScannerViewProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScannedRef = useRef<{ value: string; timestamp: number } | null>(null);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (paused) return;
    const trimmed = result.data?.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (
      lastScannedRef.current &&
      lastScannedRef.current.value === trimmed &&
      now - lastScannedRef.current.timestamp < 3000
    ) {
      return;
    }

    lastScannedRef.current = { value: trimmed, timestamp: now };
    onScan(trimmed);
  }

  if (!active) {
    return (
      <View className="items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted px-6 py-10">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-50">
          <MaterialIcons name="qr-code-scanner" size={28} color={colors.primary} />
        </View>
        <Text className="text-center text-sm font-bold text-ink">Camera scanner is paused</Text>
        <Text className="max-w-xs text-center text-xs leading-5 text-ink-muted">
          Start the camera to scan a resident&apos;s QR pickup pass directly, or paste the token
          below.
        </Text>
        <Button
          label="Start Camera Scanner"
          icon="videocam"
          size="sm"
          onPress={() => onToggleActive(true)}
        />
      </View>
    );
  }

  if (!permission) {
    return (
      <View className="items-center justify-center rounded-lg border border-border bg-surface-muted py-12">
        <Text className="text-sm text-ink-muted">Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="gap-3">
        <Banner
          tone="warning"
          title="Camera permission required"
          message="Grant camera access so DocuDash can read QR pickup passes at the counter."
        />
        <View className="flex-row gap-2">
          <Button
            label="Grant Camera Access"
            icon="videocam"
            size="sm"
            onPress={() => void requestPermission()}
          />
          <Button
            label="Cancel"
            variant="outline"
            size="sm"
            onPress={() => onToggleActive(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-black">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={paused ? undefined : handleBarcodeScanned}
        />
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View className="h-48 w-48 rounded-2xl border-2 border-white" />
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-ink-muted">
          {paused ? 'Verifying scanned pass...' : 'Align the resident QR code inside the frame.'}
        </Text>
        <Button
          label="Stop Camera"
          variant="outline"
          size="sm"
          icon="videocam-off"
          onPress={() => onToggleActive(false)}
        />
      </View>
    </View>
  );
}
