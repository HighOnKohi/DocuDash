import QRCode from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

export interface QrCodeMatrixProps {
  value: string;
  size?: number;
  quietZoneModules?: number;
}

/**
 * Renders a crisp vector QR code (ISO/IEC 18004, EC level M) across iOS,
 * Android, and Web using `qrcode` matrix data and `react-native-svg`.
 * Always keeps dark modules on a pure white background for reliable scanning
 * even when Dark Mode is enabled.
 */
export function QrCodeMatrix({
  value,
  size = 220,
  quietZoneModules = 4,
}: QrCodeMatrixProps) {
  const { pathData, viewBoxSize } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const data = qr.modules.data;
    const parts: string[] = [];

    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (data[row * count + col]) {
          const x = col + quietZoneModules;
          const y = row + quietZoneModules;
          parts.push(`M${x} ${y}h1v1h-1z`);
        }
      }
    }

    return {
      pathData: parts.join(''),
      viewBoxSize: count + quietZoneModules * 2,
    };
  }, [value, quietZoneModules]);

  return (
    <View
      className="items-center justify-center rounded-xl border border-border bg-white p-3"
      accessibilityRole="image"
      accessibilityLabel="QR pickup pass code"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
        <Rect x={0} y={0} width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" />
        <Path d={pathData} fill="#0F172A" />
      </Svg>
    </View>
  );
}
