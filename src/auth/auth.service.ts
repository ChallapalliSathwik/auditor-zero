import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { Request, Response, NextFunction } from "express";
import { db } from "../db";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set. Copy .env.example to .env and set a real secret.");
  return secret;
}

export function signup(email: string, password: string, role: string = "auditor"): { token: string; user: AuthUser } {
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) throw Object.assign(new Error("Email already registered"), { status: 409 });

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    email,
    passwordHash,
    role,
    new Date().toISOString()
  );

  const user: AuthUser = { id, email, role };
  return { token: issueToken(user), user };
}

export function login(email: string, password: string): { token: string; user: AuthUser } {
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  const user: AuthUser = { id: row.id, email: row.email, role: row.role };
  return { token: issueToken(user), user };
}

function issueToken(user: AuthUser): string {
  return jwt.sign(user, getSecret(), { expiresIn: (process.env.JWT_EXPIRES_IN as any) || "8h" });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), getSecret()) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
