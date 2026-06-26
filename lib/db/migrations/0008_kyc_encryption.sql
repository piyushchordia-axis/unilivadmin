-- 0008_kyc_encryption.sql
-- WS5 (security): encrypt sensitive KYC / e-sign fields at rest with app-layer
-- AES-256-GCM, while keeping guest-search by Aadhaar/PAN working via a
-- deterministic HMAC "blind index".
--
-- IMPORTANT — column TYPES are UNCHANGED. kyc_requests.id_number,
-- id_image_front, id_image_back, selfie_image and esign_requests.document_body,
-- signed_pdf all stay `text`; they now hold AES-256-GCM ciphertext envelopes
-- (format: enc:v1:<b64 iv>:<b64 tag>:<b64 ciphertext>) instead of plaintext.
-- No schema change is needed for those — the app encrypts on write and decrypts
-- on read, and tolerates legacy plaintext rows during/after migration.
--
-- The ONLY structural change is a new nullable blind-index column on
-- kyc_requests, plus an index for exact-match lookup. Existing plaintext rows
-- are encrypted (and back-filled with their blind index) by the runnable
-- backfill script: scripts/src/backfill-kyc-encryption.ts (idempotent).

ALTER TABLE "kyc_requests" ADD COLUMN IF NOT EXISTS "id_number_index" text;

CREATE INDEX IF NOT EXISTS "idx_kyc_requests_id_number_index"
  ON "kyc_requests" ("id_number_index");
