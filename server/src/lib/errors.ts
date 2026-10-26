export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "precondition_failed"
  | "rate_limited"
  | "policy_denied"
  | "budget_exceeded"
  | "invalid_state_transition"
  | "chain_error"
  | "internal_error";

/**
 * Application error carrying an HTTP status and a machine-readable code. The
 * API never leaks stack traces or SQL to clients; `details` is opt-in and is
 * always safe to show (field names, rule ids, etc.).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, "invalid_request", msg, details);
export const unauthorized = (msg = "Authentication required") =>
  new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "Not permitted") => new AppError(403, "forbidden", msg);
/** Used for cross-tenant probes as well: we never confirm that a foreign id exists. */
export const notFound = (msg = "Resource not found") => new AppError(404, "not_found", msg);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, "conflict", msg, details);
export const preconditionFailed = (msg: string, details?: unknown) =>
  new AppError(412, "precondition_failed", msg, details);
export const policyDenied = (msg: string, details?: unknown) =>
  new AppError(403, "policy_denied", msg, details);
export const budgetExceeded = (msg: string, details?: unknown) =>
  new AppError(422, "budget_exceeded", msg, details);
export const invalidTransition = (msg: string, details?: unknown) =>
  new AppError(409, "invalid_state_transition", msg, details);
export const chainError = (msg: string, details?: unknown) =>
  new AppError(502, "chain_error", msg, details);
