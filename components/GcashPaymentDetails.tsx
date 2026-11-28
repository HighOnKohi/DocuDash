import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { downloadBarangayGcashQr, getBarangayGcashQrUrl } from '@/services/barangayService';
import { toServiceError } from '@/services/supabase';
import type { Barangay } from '@/types/database';

import { Button } from './Button';
import { Banner } from './StateView';

export interface GcashPaymentDetailsProps {
  barangay:
    | Pick<
        Barangay,
        'name' | 'gcash_qr_storage_path' | 'gcash_account_name' | 'gcash_account_number'
      >
    | null
    | undefined;
  emptyMessage: string;
  emptyTone?: 'info' | 'warning';
  onZoomQr?: () => void;
}

/**
 * Displays the Barangay Treasury's GCash QR code (with Download QR button) and
 * GCash account details (with a one-tap Copy Number button) prior to payment.
 */
export function GcashPaymentDetails({
  barangay,
  emptyMessage,
  emptyTone = 'info',
  onZoomQr,
}: GcashPaymentDetailsProps) {
  const { colors } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const qrPath = barangay?.gcash_qr_storage_path ?? null;
  const qrUrl = getBarangayGcashQrUrl(qrPath);
  const accountName = barangay?.gcash_account_name?.trim() || null;
  const accountNumber = barangay?.gcash_account_number?.trim() || null;

  async function handleCopyNumber() {
    if (!accountNumber) return;
    await Clipboard.setStringAsync(accountNumber);
    setCopied(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
    }, 2500);
  }

  async function handleDownloadQr() {
    if (!qrPath) return;
    setDownloading(true);
    setDownloadNote(null);
    try {
      await downloadBarangayGcashQr({
        storagePath: qrPath,
        barangayName: barangay?.name,
      });
      setDownloadNote('GCash QR image download started.');
    } catch (error) {
      setDownloadNote(toServiceError(error, 'Unable to download GCash QR code.').message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <View className="gap-3">
      {qrUrl ? (
        <View className="items-center gap-2.5">
          {onZoomQr ? (
            <Pressable
              onPress={onZoomQr}
              accessibilityRole="button"
              accessibilityLabel="Enlarge Barangay GCash QR Code"
            >
              <Image
                source={{ uri: qrUrl }}
                resizeMode="contain"
                style={{
                  width: 210,
                  height: 210,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                }}
                accessibilityLabel="Barangay GCash QR Code"
              />
            </Pressable>
          ) : (
            <Image
              source={{ uri: qrUrl }}
              resizeMode="contain"
              style={{
                width: 210,
                height: 210,
                borderRadius: 12,
                backgroundColor: '#FFFFFF',
              }}
              accessibilityLabel="Barangay GCash QR Code"
            />
          )}

          {onZoomQr ? (
            <Text className="text-[11px] text-ink-subtle">Tap QR code to enlarge</Text>
          ) : null}

          <Button
            label="Download GCash QR"
            icon="download"
            variant="outline"
            size="sm"
            loading={downloading}
            onPress={() => void handleDownloadQr()}
          />

          {downloadNote ? (
            <Text className="text-center text-[11px] font-medium text-ink-muted">
              {downloadNote}
            </Text>
          ) : null}
        </View>
      ) : null}

      {accountName || accountNumber ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3">
          <View className="min-w-[160px] flex-1 gap-0.5">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              GCash Recipient
            </Text>
            {accountName ? (
              <Text className="text-sm font-bold text-ink">{accountName}</Text>
            ) : null}
            {accountNumber ? (
              <Text selectable className="font-mono text-sm font-semibold text-primary">
                {accountNumber}
              </Text>
            ) : null}
          </View>

          {accountNumber ? (
            <Pressable
              onPress={() => void handleCopyNumber()}
              accessibilityRole="button"
              accessibilityLabel="Copy GCash number"
              className={`flex-row items-center gap-1.5 rounded-lg border px-3 py-2 ${
                copied
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60'
                  : 'border-primary-200 bg-primary-50'
              }`}
            >
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={16}
                color={copied ? colors.success : colors.primary}
              />
              <Text
                className={`text-xs font-bold ${
                  copied ? 'text-emerald-800 dark:text-emerald-300' : 'text-primary'
                }`}
              >
                {copied ? 'Copied!' : 'Copy Number'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!qrUrl && !accountNumber ? <Banner tone={emptyTone} message={emptyMessage} /> : null}
    </View>
  );
}
