/**
 * EventQrCode — Shows the student's unique QR code for event check-in.
 *
 * Displayed after registration. The QR encodes the qr_token which
 * the teacher/admin scans at the venue.
 *
 * QR data format: "mc-event:{eventId}:{qr_token}"
 * This prefix prevents confusion with random QR codes.
 */

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

export default function EventQrCode({ eventId, qrToken, eventTitle, className = "" }) {
  if (!qrToken) return null;

  const qrData = `mc-event:${eventId}:${qrToken}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex flex-col items-center gap-3 ${className}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">
        Your Check-in QR
      </p>
      <div className="rounded-xl border border-line/15 bg-white p-3">
        <QRCodeSVG
          value={qrData}
          size={180}
          level="M"
          bgColor="#ffffff"
          fgColor="#0a0f1f"
          includeMargin={false}
        />
      </div>
      <p className="max-w-[200px] text-center text-[10px] text-text-dim leading-relaxed">
        Show this to the organizer at the venue for check-in
      </p>
    </motion.div>
  );
}
