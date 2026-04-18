/**
 * Public certificate verification.
 *
 * Anyone (no login) can hit GET /api/certificates/verify/:token with
 * the UUID encoded in a cert's QR code to confirm it's real. We only
 * return non-sensitive, display-safe fields — recipient name, event
 * name, issue date, issuer, and the verification status — never the
 * recipient's email.
 *
 * Unlike every other endpoint in this controller, this one talks to
 * Supabase directly (not req.db) because:
 *   1. The caller has no session and therefore no org context.
 *   2. A cert's verify URL is meant to work across tenants — a
 *      Coursera employer looking up a Math Collective cert cares
 *      that the cert exists, not which org issued it.
 *
 * Service-role RLS bypass is appropriate here; we explicitly scope
 * the SELECT to only the columns we're willing to expose.
 */

import supabase from "../../config/supabase.js";
import { logger } from "../../config/logger.js";

export const verifyCertificate = async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 10) {
    return res.status(400).json({ valid: false, reason: "missing or malformed token" });
  }

  try {
    const { data, error } = await supabase
      .from("certificates")
      .select(`
        id,
        recipient_name,
        event_name,
        issued_at,
        download_token,
        certificate_batches:batch_id (
          event_date,
          issued_by,
          signatory_name,
          signatory_title
        )
      `)
      .eq("download_token", token)
      .maybeSingle();

    if (error) {
      logger.warn({ err: error, token }, "cert verify query failed");
      return res.status(500).json({ valid: false, reason: "lookup failed" });
    }
    if (!data) {
      return res.status(404).json({ valid: false, reason: "no certificate with that token" });
    }

    const batch = data.certificate_batches || {};
    return res.json({
      valid:          true,
      recipientName:  data.recipient_name,
      eventName:      data.event_name,
      eventDate:      batch.event_date || null,
      issuedAt:       data.issued_at,
      issuedBy:       batch.issued_by || "Math Collective",
      signatory:      batch.signatory_name
        ? { name: batch.signatory_name, title: batch.signatory_title || null }
        : null,
      certificateId:  deriveCertId(data.download_token),
    });
  } catch (err) {
    logger.error({ err }, "cert verify crashed");
    return res.status(500).json({ valid: false, reason: "internal error" });
  }
};

function deriveCertId(token) {
  const hex = (token || "").replace(/-/g, "").toUpperCase().padEnd(12, "0");
  return `MC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
