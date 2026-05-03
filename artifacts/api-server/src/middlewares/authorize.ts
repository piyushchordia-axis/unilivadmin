import { Request, Response, NextFunction } from "express";
import { can, type Module, type Permission, type UserRole } from "../lib/permissions.js";

export function authorize(module: Module, perm: Permission = "view") {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role as UserRole | undefined;
    if (!role) {
      res.status(401).json({ success: false, error: "Unauthenticated" });
      return;
    }
    if (!can(role, module, perm)) {
      res.status(403).json({ success: false, error: "Forbidden — insufficient permissions" });
      return;
    }
    next();
  };
}
