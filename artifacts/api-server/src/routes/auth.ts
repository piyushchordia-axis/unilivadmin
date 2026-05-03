import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, signAccessToken, signRefreshToken } from "../middlewares/auth.js";
import { newId } from "../lib/id.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: "Email and password required" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ success: false, error: "Account is inactive" });
      return;
    }

    await db.update(usersTable).set({ lastLogin: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    const authUser = { id: user.id, email: user.email, role: user.role, propertyId: user.propertyId };
    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(user.id);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokensTable).values({ id: newId(), userId: user.id, token: refreshToken, expiresAt });

    res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env["NODE_ENV"] === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({
      success: true,
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, propertyId: user.propertyId, isActive: user.isActive, lastLogin: user.lastLogin, createdAt: user.createdAt },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.["refreshToken"];
    if (!token) {
      res.status(401).json({ success: false, error: "No refresh token" });
      return;
    }

    const [rt] = await db.select().from(refreshTokensTable).where(eq(refreshTokensTable.token, token));
    if (!rt || rt.expiresAt < new Date()) {
      res.status(401).json({ success: false, error: "Invalid or expired refresh token" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rt.userId));
    if (!user) {
      res.status(401).json({ success: false, error: "User not found" });
      return;
    }

    const authUser = { id: user.id, email: user.email, role: user.role, propertyId: user.propertyId };
    const accessToken = signAccessToken(authUser);

    res.json({ success: true, accessToken, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, propertyId: user.propertyId, isActive: user.isActive, lastLogin: user.lastLogin, createdAt: user.createdAt } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/logout", authenticate, async (req, res) => {
  try {
    const token = req.cookies?.["refreshToken"];
    if (token) {
      await db.delete(refreshTokensTable).where(eq(refreshTokensTable.token, token));
    }
    res.clearCookie("refreshToken");
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, propertyId: user.propertyId, isActive: user.isActive, lastLogin: user.lastLogin, createdAt: user.createdAt } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
