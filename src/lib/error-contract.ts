export type AppErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYMENT_PENDING"
  | "CAPACITY_FULL"
  | "INTERNAL_ERROR";

export type ErrorContract = {
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ActionFailure = {
  success: false;
  code: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  error: ErrorContract;
};

export function createError(
  code: AppErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorContract {
  return { code, message, ...(details ? { details } : {}) };
}

export function failAction(
  code: AppErrorCode,
  message: string,
  details?: Record<string, unknown>
): ActionFailure {
  const error = createError(code, message, details);
  return {
    success: false,
    code,
    message,
    ...(details ? { details } : {}),
    error,
  };
}
