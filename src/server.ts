import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { login, requireAuth, signup } from "./auth/auth.service";
import { tools } from "./mcp/tools";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Health ---
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// --- Auth ---
app.post("/api/auth/signup", (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    res.status(201).json(signup(email, password, role));
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/login", (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    res.json(login(email, password));
  } catch (err) {
    next(err);
  }
});

// --- Generic MCP-tool-backed REST endpoints (all require auth) ---
app.use("/api", requireAuth);

app.post("/api/docs", async (req, res, next) => {
  try {
    res.status(201).json(await tools.ingest_document.handler(tools.ingest_document.schema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});

app.get("/api/docs", async (_req, res, next) => {
  try {
    res.json(await tools.list_documents.handler({}));
  } catch (err) {
    next(err);
  }
});

app.post("/api/demo/seed", async (_req, res, next) => {
  try {
    res.status(201).json(await tools.seed_demo_documents.handler({}));
  } catch (err) {
    next(err);
  }
});

app.post("/api/audits", async (req, res, next) => {
  try {
    res.status(201).json(await tools.analyze_document.handler(tools.analyze_document.schema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});

app.get("/api/audits", async (_req, res, next) => {
  try {
    res.json(await tools.list_audits.handler({}));
  } catch (err) {
    next(err);
  }
});

app.get("/api/audits/:id", async (req, res, next) => {
  try {
    res.json(await tools.get_audit_result.handler({ auditId: req.params.id }));
  } catch (err) {
    next(err);
  }
});

app.get("/api/audits/:id/verify", async (req, res, next) => {
  try {
    const findingId = typeof req.query.findingId === "string" ? req.query.findingId : undefined;
    res.json(await tools.verify_replay_chain.handler({ auditId: req.params.id, findingId }));
  } catch (err) {
    next(err);
  }
});

app.get("/api/audits/:id/trail", async (req, res, next) => {
  try {
    const findingId = typeof req.query.findingId === "string" ? req.query.findingId : undefined;
    res.json(await tools.get_decision_trail.handler({ auditId: req.params.id, findingId }));
  } catch (err) {
    next(err);
  }
});

// Dev-only tamper affordance for the live "chain catches it" demo.
app.post("/api/tamper", async (req, res, next) => {
  try {
    res.json(await tools.debug_tamper_record.handler(tools.debug_tamper_record.schema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});

// --- Error handler ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = err.status || (err.name === "ZodError" ? 400 : 500);
  res.status(status).json({ error: err.message || "Internal server error" });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Auditor Zero API listening on http://localhost:${port}`);
});
