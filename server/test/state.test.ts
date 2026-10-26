import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TRANSITIONS, type RequestStatus } from "../src/procurement/state.js";

describe("request state machine", () => {
  it("allows the documented happy path only through an explicit decision", () => {
    expect(canTransition("draft", "open")).toBe(true);
    expect(canTransition("open", "pending_approval")).toBe(true);
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("approved", "awarded")).toBe(true);
    expect(canTransition("awarded", "completed")).toBe(true);
  });

  it("never jumps from open to awarded (no policy bypass)", () => {
    expect(canTransition("open", "awarded")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
  });

  it("treats completed, cancelled, rejected and expired as terminal", () => {
    for (const s of ["completed", "cancelled", "rejected", "expired"] as RequestStatus[]) {
      expect(TRANSITIONS[s]).toEqual([]);
    }
  });

  it("throws a 409 AppError for illegal transitions", () => {
    try {
      assertTransition("completed", "open");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { status?: number }).status).toBe(409);
      expect((err as { code?: string }).code).toBe("invalid_state_transition");
    }
  });

  it("only references known states", () => {
    const known = new Set(Object.keys(TRANSITIONS));
    for (const [, targets] of Object.entries(TRANSITIONS)) {
      for (const t of targets) expect(known.has(t)).toBe(true);
    }
  });
});
