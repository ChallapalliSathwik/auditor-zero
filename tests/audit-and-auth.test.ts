import { describe, it, expect } from "vitest";
import fs from "fs";

process.env.DATABASE_PATH = "./data/test-audit-auth.db";
process.env.JWT_SECRET = "test-secret";
if (fs.existsSync(process.env.DATABASE_PATH)) fs.unlinkSync(process.env.DATABASE_PATH);

import { ingestDocument, getDoc, listDocs } from "../src/modules/audit/audit.service";
import { signup, login } from "../src/auth/auth.service";

describe("Document ingestion", () => {
  it("ingests and retrieves a document", () => {
    const doc = ingestDocument({
      title: "Test Policy",
      docType: "policy",
      version: "v1",
      accessTier: "tier-1",
      content: "All devices must have encryption enabled.",
    });
    expect(doc.id).toBeTruthy();
    const fetched = getDoc(doc.id);
    expect(fetched?.title).toBe("Test Policy");
    expect(listDocs().length).toBeGreaterThan(0);
  });
});

describe("Auth", () => {
  const email = `user-${Date.now()}@example.com`;

  it("signs up and returns a token", () => {
    const { token, user } = signup(email, "correct-horse-battery-staple");
    expect(token).toBeTruthy();
    expect(user.email).toBe(email);
    expect(user.role).toBe("auditor");
  });

  it("rejects duplicate signup", () => {
    expect(() => signup(email, "another-password")).toThrow();
  });

  it("logs in with correct password and rejects wrong password", () => {
    const { token } = login(email, "correct-horse-battery-staple");
    expect(token).toBeTruthy();
    expect(() => login(email, "wrong-password")).toThrow();
  });
});
