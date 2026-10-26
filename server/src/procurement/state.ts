import type { Permission } from "../auth/rbac.js";
import { invalidTransition } from "../lib/errors.js";

export type RequestStatus =
  | "draft"
  | "open"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "awarded"
  | "completed"
  | "cancelled"
  | "expired";

/**
 * The procurement request state machine. Transitions are explicit and closed:
 * anything not listed here is rejected with 409. `awarded -> cancelled` exists
 * only for the narrow case where an agreement was never funded on-chain.
 */
export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ["open", "cancelled"],
  // `open -> awarded` is deliberately absent: money may only be committed
  // after an explicit policy decision (approved) — see docs/AGENT_POLICY.md.
  open: ["pending_approval", "approved", "cancelled", "expired"],
  pending_approval: ["approved", "rejected", "cancelled", "expired"],
  approved: ["awarded", "cancelled", "expired"],
  rejected: [],
  awarded: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

export const TERMINAL: ReadonlySet<RequestStatus> = new Set(["completed", "cancelled", "rejected", "expired"]);

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw invalidTransition(`cannot move request from ${from} to ${to}`, { from, to });
  }
}

/** Permission required to perform a transition, or null for system transitions. */
export function permissionForTransition(to: RequestStatus): Permission | null {
  switch (to) {
    case "open":
      return "request:publish";
    case "pending_approval":
      return "request:publish";
    case "approved":
    case "rejected":
      return "request:approve";
    case "awarded":
      return "request:award";
    case "cancelled":
      return "request:cancel";
    case "completed":
      return null;
    case "expired":
      return null;
    default:
      return null;
  }
}

export const ALLOWED_TRANSITIONS_VIEW = TRANSITIONS;
