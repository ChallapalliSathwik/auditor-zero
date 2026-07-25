import { describe, it, expect, vi } from "vitest";
import { authenticateWithCredentials } from "../src/auth/demo-auth";

describe("authenticateWithCredentials", () => {
  it("signs up a user and stores the token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "abc123" }),
    });
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    };

    const token = await authenticateWithCredentials({
      fetchImpl,
      storage,
      serviceUrl: "http://localhost:8080",
      email: "new-user@example.com",
      password: "secret123",
      mode: "signup",
    });

    expect(token).toBe("abc123");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8080/api/auth/signup",
      expect.objectContaining({ method: "POST" })
    );
    expect(storage.setItem).toHaveBeenCalledWith("auditor_zero_token", "abc123");
  });
});
