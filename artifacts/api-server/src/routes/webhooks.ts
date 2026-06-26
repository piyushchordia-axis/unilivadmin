/**
 * Inbound provider webhooks. Currently: Amazon SES delivery events via SNS
 * (bounce / complaint). A permanent bounce or a complaint adds the address to
 * the notification suppression list, so the worker never sends to it again.
 *
 * SNS posts JSON (often as text/plain), so the body is read raw and parsed. The
 * SNS signature is verified (sns-validator) before any state change — an
 * unverified webhook could otherwise let anyone poison deliverability. In
 * non-production only, SES_WEBHOOK_SKIP_VERIFY=1 bypasses verification for local
 * testing; it is ignored in production.
 */
import { Router, text as textBody, type Request, type Response } from "express";
import { suppress } from "@workspace/notify-core";
import { IS_PRODUCTION } from "../config/env.js";

const router = Router();

const SKIP_VERIFY = process.env["NODE_ENV"] !== "production" && process.env["SES_WEBHOOK_SKIP_VERIFY"] === "1";

// Expected SNS topic ARN. sns-validator only proves the message is signed by
// *some* AWS SNS topic, not *our* topic, so without this any AWS account can
// forge a valid bounce/complaint and poison the suppression list. REQUIRED in
// production (fail closed): when unset in prod the endpoint rejects requests.
// In non-production only we warn and proceed for local testing.
const EXPECTED_TOPIC_ARN = process.env["SES_SNS_TOPIC_ARN"];

async function verifySns(envelope: unknown): Promise<boolean> {
  if (SKIP_VERIFY) return true;
  try {
    // Indirect specifier: keeps TS from statically resolving the (untyped)
    // module and erroring on the missing declaration file.
    const pkg = "sns-validator";
    const mod = (await import(pkg)) as any;
    const Validator = mod.default || mod;
    const validator = new Validator();
    await new Promise<void>((resolve, reject) =>
      validator.validate(envelope, (err: unknown) => (err ? reject(err) : resolve())),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Only follow an SNS SubscriptionConfirmation SubscribeURL if it parses to an
 * https URL on an sns.<region>.amazonaws.com host. The URL is normally covered
 * by the SNS signature, but when SES_WEBHOOK_SKIP_VERIFY bypasses verification
 * in non-prod it becomes attacker-controlled, so never derive an outbound
 * request target from an unvalidated field (SSRF guard).
 */
function isTrustedSubscribeUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Suppress the recipients of a permanent bounce or a complaint. Exported so the
 * suppression logic is unit-testable independent of SNS signature verification.
 */
export async function handleSesNotification(message: any): Promise<{ suppressed: string[] }> {
  const suppressed: string[] = [];
  const type = message?.notificationType || message?.eventType;

  if (type === "Bounce" && message?.bounce?.bounceType === "Permanent") {
    for (const r of message.bounce.bouncedRecipients ?? []) {
      if (r?.emailAddress) {
        await suppress("EMAIL", r.emailAddress, "HARD_BOUNCE", message.bounce.bounceSubType ?? null);
        suppressed.push(r.emailAddress);
      }
    }
  } else if (type === "Complaint") {
    for (const r of message.complaint?.complainedRecipients ?? []) {
      if (r?.emailAddress) {
        await suppress("EMAIL", r.emailAddress, "COMPLAINT", message.complaint?.complaintFeedbackType ?? null);
        suppressed.push(r.emailAddress);
      }
    }
  }
  return { suppressed };
}

router.post("/webhooks/ses", textBody({ type: () => true }), async (req: Request, res: Response) => {
  try {
    const envelope = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!envelope || typeof envelope !== "object") {
      res.status(400).json({ success: false, error: "Invalid payload" });
      return;
    }

    if (!(await verifySns(envelope))) {
      res.status(403).json({ success: false, error: "Invalid SNS signature" });
      return;
    }

    // The signature only proves the envelope came from some AWS SNS topic, not
    // ours. Enforce an exact TopicArn match so a validly-signed message from a
    // foreign topic cannot forge bounce/complaint suppression.
    if (EXPECTED_TOPIC_ARN) {
      if (envelope.TopicArn !== EXPECTED_TOPIC_ARN) {
        req.log.warn({ topicArn: envelope.TopicArn }, "SES/SNS webhook rejected: unexpected TopicArn");
        res.status(403).json({ success: false, error: "Unexpected SNS topic" });
        return;
      }
    } else if (IS_PRODUCTION) {
      // Fail closed: without the allowlist any AWS account could forge a signed
      // bounce/complaint and poison the suppression list. Never process in prod.
      req.log.error("SES_SNS_TOPIC_ARN is not set; rejecting SES/SNS webhook in production");
      res.status(403).json({ success: false, error: "Webhook not configured" });
      return;
    } else {
      req.log.warn("SES_SNS_TOPIC_ARN is not set; skipping TopicArn allowlist check (non-production)");
    }

    // One-time subscription handshake when wiring the SNS topic to this endpoint.
    if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
      if (!isTrustedSubscribeUrl(envelope.SubscribeURL)) {
        req.log.warn("SES/SNS subscription rejected: untrusted SubscribeURL");
        res.status(400).json({ success: false, error: "Invalid SubscribeURL" });
        return;
      }
      await fetch(envelope.SubscribeURL).catch(() => {});
      req.log.info("SES/SNS subscription confirmed");
      res.json({ success: true, confirmed: true });
      return;
    }

    if (envelope.Type === "Notification") {
      let message: any = {};
      try {
        message = JSON.parse(envelope.Message);
      } catch {
        message = {};
      }
      const result = await handleSesNotification(message);
      if (result.suppressed.length) {
        req.log.info({ count: result.suppressed.length }, "SES bounce/complaint → addresses suppressed");
      }
      res.json({ success: true, ...result });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
