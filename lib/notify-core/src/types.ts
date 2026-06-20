/** Channels the dispatcher can deliver through (mirrors the DB notification_channel enum). */
export type Channel = "EMAIL" | "SMS" | "PUSH" | "WHATSAPP" | "IN_APP";

/** The BullMQ queue every external delivery flows through. */
export const QUEUE_NAME = "notifications";

/** Job payload — just the durable outbox id; the row in Postgres is the source of truth. */
export interface DeliveryJob {
  outboxId: string;
}

/** The subset of a notification_outbox row the dispatcher needs to deliver it. */
export interface OutboxRow {
  id: string;
  channel: Channel;
  toAddress: string | null;
  subject: string | null;
  body: string | null;
}
