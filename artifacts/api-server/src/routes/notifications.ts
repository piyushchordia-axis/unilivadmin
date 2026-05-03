import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth.js";
import { newId } from "../lib/id.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", authenticate, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);
    const unreadCount = rows.filter((r) => !r.isRead).length;
    res.json({ success: true, data: rows, meta: { unreadCount } });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

notificationsRouter.patch("/:id/read", authenticate, async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, req.params["id"] as string), eq(notificationsTable.userId, req.user!.id)));
    res.json({ success: true });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

notificationsRouter.patch("/read-all", authenticate, async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, req.user!.id));
    res.json({ success: true });
  } catch (err) { req.log.error(err); res.status(500).json({ success: false, error: "Internal server error" }); }
});

export async function createNotification(
  userId: string,
  data: { title: string; body?: string; type: string; link?: string },
) {
  await db.insert(notificationsTable).values({
    id: newId(),
    userId,
    title: data.title,
    body: data.body || null,
    type: data.type,
    link: data.link || null,
    isRead: false,
  });
}
