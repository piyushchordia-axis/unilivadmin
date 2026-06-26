/**
 * Backfills WS5 field encryption for existing KYC / e-sign rows.
 *
 * Walks every kyc_requests and esign_requests row and, for any whose sensitive
 * fields are still PLAINTEXT (do not start with the `enc:v1:` envelope prefix),
 * encrypts them in place with AES-256-GCM and — for KYC — sets id_number_index
 * to the HMAC blind index of the plaintext id number.
 *
 *   kyc_requests:   id_number, id_image_front, id_image_back, selfie_image
 *                   + id_number_index (blind index of the plaintext id_number)
 *   esign_requests: document_body, signed_pdf
 *
 * IDEMPOTENT: rows already encrypted (envelope-prefixed) are skipped, so the
 * script is safe to re-run. The app's decrypt() passes legacy plaintext through
 * unchanged, so the system keeps working before, during and after this backfill.
 *
 * The crypto scheme here is byte-compatible with
 * artifacts/api-server/src/lib/field-crypto.ts. (This is a separate package and
 * cannot import from api-server, so the logic is replicated — exactly like the
 * seed scripts replicate food-service helpers.)
 *
 * Requires ENCRYPTION_KEY (32-byte / 64-hex) in the environment, same as the API.
 *
 * Run:  ENCRYPTION_KEY=<hex> pnpm --filter @workspace/scripts exec tsx ./src/backfill-kyc-encryption.ts
 *   or: ENCRYPTION_KEY=<hex> npx tsx scripts/src/backfill-kyc-encryption.ts
 */
import { db, pool, kycRequestsTable, esignRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

// ─── Crypto (replicated from api-server field-crypto.ts; byte-compatible) ─────

const ENVELOPE_PREFIX = "enc:v1:";
const BLIND_INDEX_INFO = "uniliv:kyc:blind-index:v1";

function getKey(): Buffer {
  const hex = process.env["ENCRYPTION_KEY"];
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. A 32-byte (64 hex chars) key is required to backfill KYC encryption.",
    );
  }
  const key = Buffer.from(hex.trim(), "hex");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${key.length} bytes.`);
  }
  return key;
}

function getBlindIndexKey(): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", getKey(), Buffer.alloc(0), BLIND_INDEX_INFO, 32));
}

function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    ENVELOPE_PREFIX +
    iv.toString("base64") + ":" + tag.toString("base64") + ":" + ciphertext.toString("base64")
  );
}

/** Encrypt a nullable value: null/empty stays null; already-encrypted stays as-is. */
function encryptNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

function blindIndex(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return crypto.createHmac("sha256", getBlindIndexKey()).update(normalized, "utf8").digest("hex");
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

async function backfillKyc(): Promise<{ scanned: number; updated: number }> {
  const rows = await db.select().from(kycRequestsTable);
  let updated = 0;
  for (const row of rows) {
    // Idempotent: skip rows whose id_number is already an envelope.
    if (isEncrypted(row.idNumber)) continue;
    const plaintextIdNumber = row.idNumber;
    await db
      .update(kycRequestsTable)
      .set({
        idNumber: encryptNullable(plaintextIdNumber)!,
        idNumberIndex: blindIndex(plaintextIdNumber),
        idImageFront: encryptNullable(row.idImageFront),
        idImageBack: encryptNullable(row.idImageBack),
        selfieImage: encryptNullable(row.selfieImage),
        updatedAt: new Date(),
      })
      .where(eq(kycRequestsTable.id, row.id));
    updated++;
  }
  return { scanned: rows.length, updated };
}

async function backfillEsign(): Promise<{ scanned: number; updated: number }> {
  const rows = await db.select().from(esignRequestsTable);
  let updated = 0;
  for (const row of rows) {
    const bodyEncrypted = isEncrypted(row.documentBody);
    const pdfEncrypted = row.signedPdf === null || isEncrypted(row.signedPdf);
    // Idempotent: skip rows whose sensitive fields are already enveloped.
    if (bodyEncrypted && pdfEncrypted) continue;
    await db
      .update(esignRequestsTable)
      .set({
        documentBody: encryptNullable(row.documentBody)!,
        signedPdf: encryptNullable(row.signedPdf),
        updatedAt: new Date(),
      })
      .where(eq(esignRequestsTable.id, row.id));
    updated++;
  }
  return { scanned: rows.length, updated };
}

async function main(): Promise<void> {
  console.log("▶ WS5 backfill: encrypting KYC / e-sign fields at rest…");
  // Fail fast with a clear message if the key is missing/invalid.
  getKey();

  const kyc = await backfillKyc();
  console.log(`  ✓ kyc_requests:   ${kyc.updated} encrypted / ${kyc.scanned} scanned (${kyc.scanned - kyc.updated} already encrypted)`);

  const esign = await backfillEsign();
  console.log(`  ✓ esign_requests: ${esign.updated} encrypted / ${esign.scanned} scanned (${esign.scanned - esign.updated} already encrypted)`);

  console.log("✅ KYC encryption backfill complete.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
