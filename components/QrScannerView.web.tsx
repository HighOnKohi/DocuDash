import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Banner } from '@/components/StateView';
import { colors } from '@/constants/theme';

export interface QrScannerViewProps {
  /** Whether the webcam preview and QR decoding are actively running. */
  active: boolean;
  /** Pauses decoding while a scanned token is being verified on the server. */
  paused: boolean;
  onScan: (rawValue: string) => void;
  onToggleActive: (nextActive: boolean) => void;
}

/**
 * Web QR scanner using `navigator.mediaDevices.getUserMedia` + `<canvas>` +
 * `jsqr` so barangay counter desktops and tablets can scan resident QR passes
 * directly in any modern browser.
 */
export function QrScannerView({
  active,
  paused,
  onScan,
  onToggleActive,
}: QrScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const lastScannedRef = useRef<{ value: string; timestamp: number } | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function startWebcam() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        if (!cancelled) {
          setCameraError(
            'Camera access is unavailable in this browser context. Use HTTPS or enter the token manually below.'
          );
        }
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        if (!cancelled) {
          setCameraError(null);
          setCameraReady(true);
        }

        intervalId = setInterval(() => {
          if (cancelled || pausedRef.current) return;
          const v = videoRef.current;
          const canvas = canvasRef.current;
          if (!v || !canvas || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) {
            return;
          }

          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          const raw = decoded?.data?.trim();
          if (!raw) return;

          const now = Date.now();
          if (
            lastScannedRef.current &&
            lastScannedRef.current.value === raw &&
            now - lastScannedRef.current.timestamp < 3000
          ) {
            return;
          }

          lastScannedRef.current = { value: raw, timestamp: now };
          onScanRef.current(raw);
        }, 250);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Camera permission was denied or no camera was detected.';
          setCameraError(
            `Unable to start webcam (${msg}). You can still verify passes using manual token entry below.`
          );
          setCameraReady(false);
        }
      }
    }

    void startWebcam();

    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setCameraReady(false);
    };
  }, [active]);

  if (!active) {
    return (
      <View className="items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted px-6 py-10">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-50">
          <MaterialIcons name="qr-code-scanner" size={28} color={colors.primary} />
        </View>
        <Text className="text-center text-sm font-bold text-ink">Webcam scanner is paused</Text>
        <Text className="max-w-xs text-center text-xs leading-5 text-ink-muted">
          Click below to turn on your counter webcam and scan a resident&apos;s QR pickup pass, or
          enter the token manually.
        </Text>
        <Button
          label="Start Webcam Scanner"
          icon="videocam"
          size="sm"
          onPress={() => {
            setCameraError(null);
            onToggleActive(true);
          }}
        />
      </View>
    );
  }

  return (
    <View className="gap-3">
      {cameraError ? (
        <Banner
          tone="warning"
          title="Camera unavailable"
          message={cameraError}
          actionLabel="Close Camera"
          onAction={() => onToggleActive(false)}
        />
      ) : (
        <View className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-ink">
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <View className="h-48 w-48 rounded-2xl border-2 border-surface" />
          </View>
        </View>
      )}

      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-xs text-ink-muted">
          {paused
            ? 'Verifying scanned pass...'
            : cameraReady
              ? 'Hold the resident QR pickup pass steady inside the square.'
              : 'Starting webcam...'}
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
