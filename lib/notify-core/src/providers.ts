import crypto from "node:crypto";
import type { OutboxRow } from "./types.js";

/**
 * Delivers one outbox row through the configured transport for its channel and
 * returns the provider message id. A real provider is selected when its env is
 * present (SMTP_/TWILIO_); otherwise a "log" transport records the rendered
 * message and reports success so the pipeline is fully exercised in dev.
 *
 * Phase 3 replaces these with first-class ChannelProvider adapters (SES/Sendgrid,
 * MSG91, FCM, web-push, WhatsApp) selected via a registry.
 */
export async function deliver(row: OutboxRow): Promise<string> {
  const smtpReady = !!process.env["SMTP_HOST"];
  const twilioReady = !!process.env["TWILIO_AUTH_TOKEN"];

  if (row.channel === "EMAIL" && row.toAddress && smtpReady) {
    const pkg = "nodemailer";
    const nodemailer = (await import(pkg)) as any;
    const transport = nodemailer.createTransport({
      host: process.env["SMTP_HOST"],
      port: Number(process.env["SMTP_PORT"] || 587),
      secure: process.env["SMTP_SECURE"] === "true",
      auth: process.env["SMTP_USER"]
        ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] }
        : undefined,
    });
    const info = await transport.sendMail({
      from: process.env["EMAIL_FROM"] || process.env["SMTP_FROM"] || "Uniliv <no-reply@uniliv.com>",
      to: row.toAddress,
      subject: row.subject || "",
      text: row.body || "",
    });
    return info.messageId;
  }

  if (row.channel === "SMS" && row.toAddress && twilioReady) {
    const pkg = "twilio";
    const twilioMod = (await import(pkg)) as any;
    const client = twilioMod.default(process.env["TWILIO_ACCOUNT_SID"]!, process.env["TWILIO_AUTH_TOKEN"]!);
    const msg = await client.messages.create({ from: process.env["TWILIO_FROM"]!, to: row.toAddress, body: row.body || "" });
    return msg.sid;
  }

  // Dev/log transport — record the rendered message; report success.
  console.info(`[notify:${row.channel}] to=${row.toAddress ?? "-"} :: ${(row.body ?? "").slice(0, 600)}`);
  return `log-${crypto.randomUUID()}`;
}
