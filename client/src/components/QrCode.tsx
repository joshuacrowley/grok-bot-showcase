import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

interface QrCodeProps {
  value: string;
  /** Rendered pixel size, including the quiet zone. */
  size: number;
  className?: string;
}

/** Scanners need this much light margin around the code, in modules. */
const QUIET_ZONE = 2;

/** Drawn as one SVG path, so it stays crisp at any size a projector throws it to. */
export const QrCode: React.FC<QrCodeProps> = ({ value, size, className }) => {
  const { d, extent } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { d: path, extent: count + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={d} fill="#111111" />
    </svg>
  );
};
