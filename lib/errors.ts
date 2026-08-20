export type AppErrorKind =
  | "validation"
  | "auth"
  | "permission"
  | "network"
  | "conflict"
  | "unexpected";

type AppErrorInput = {
  kind: AppErrorKind;
  message: string;
  code?: string;
  status?: number;
  originalError?: unknown;
};

type ToAppErrorOptions = {
  fallbackMessage?: string;
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email before logging in.",
  user_already_exists: "An account with this email already exists.",
  email_exists: "An account with this email already exists.",
  weak_password: "Choose a stronger password and try again.",
  over_email_send_rate_limit: "Too many requests. Please wait a moment and try again.",
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly code?: string;
  readonly status?: number;
  readonly originalError?: unknown;

  constructor(input: AppErrorInput) {
    super(input.message);
    this.name = "AppError";
    this.kind = input.kind;
    this.code = input.code;
    this.status = input.status;
    this.originalError = input.originalError;
  }
}

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  return {};
}

function readCode(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStatus(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readMessage(error: unknown, errorLike: ErrorLike) {
  if (typeof error === "string") return error;
  return typeof errorLike.message === "string" ? errorLike.message : "";
}

export function toAppError(
  error: unknown,
  options: ToAppErrorOptions = {}
): AppError {
  if (error instanceof AppError) return error;

  const errorLike = asErrorLike(error);
  const code = readCode(errorLike.code);
  const status = readStatus(errorLike.statusCode ?? errorLike.status);
  const rawMessage = readMessage(error, errorLike);
  const message = rawMessage.toLowerCase();

  if (code && AUTH_MESSAGES[code]) {
    const kind: AppErrorKind =
      code === "user_already_exists" || code === "email_exists"
        ? "conflict"
        : code === "weak_password"
          ? "validation"
          : "auth";

    return new AppError({
      kind,
      message: AUTH_MESSAGES[code],
      code,
      status,
      originalError: error,
    });
  }

  if (
    code === "23505" ||
    status === 409 ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("duplicate key")
  ) {
    return new AppError({
      kind: "conflict",
      message: "That information is already in use. Please choose another value.",
      code,
      status,
      originalError: error,
    });
  }

  if (
    code === "42501" ||
    status === 403 ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not authorized")
  ) {
    return new AppError({
      kind: "permission",
      message: "You do not have permission to perform this action.",
      code,
      status,
      originalError: error,
    });
  }

  if (
    status === 401 ||
    message.includes("invalid login credentials") ||
    message.includes("email not confirmed") ||
    message.includes("jwt expired") ||
    message.includes("not authenticated")
  ) {
    return new AppError({
      kind: "auth",
      message: message.includes("invalid login credentials")
        ? "Incorrect email or password."
        : message.includes("email not confirmed")
          ? "Confirm your email before logging in."
          : "Please sign in again to continue.",
      code,
      status,
      originalError: error,
    });
  }

  if (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("connection refused")
  ) {
    return new AppError({
      kind: "network",
      message: "Check your internet connection and try again.",
      code,
      status,
      originalError: error,
    });
  }

  return new AppError({
    kind: "unexpected",
    message: options.fallbackMessage ?? "Something went wrong. Please try again.",
    code,
    status,
    originalError: error,
  });
}
