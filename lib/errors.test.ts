import { AppError, toAppError } from "./errors";

describe("toAppError", () => {
  it("returns an existing AppError unchanged", () => {
    const original = new AppError({
      kind: "validation",
      message: "Fix the input.",
      code: "validation_error",
    });

    expect(toAppError(original)).toBe(original);
  });

  it("maps invalid credentials to a safe auth error", () => {
    const error = toAppError({
      code: "invalid_credentials",
      message: "Invalid login credentials",
      status: 400,
    });

    expect(error.kind).toBe("auth");
    expect(error.message).toBe("Incorrect email or password.");
    expect(error.code).toBe("invalid_credentials");
  });

  it("maps row-level security failures to permission errors", () => {
    const error = toAppError({
      code: "42501",
      message: "new row violates row-level security policy",
    });

    expect(error.kind).toBe("permission");
    expect(error.message).toBe("You do not have permission to perform this action.");
  });

  it("maps unique violations to conflict errors", () => {
    const error = toAppError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });

    expect(error.kind).toBe("conflict");
    expect(error.message).toBe(
      "That information is already in use. Please choose another value."
    );
  });

  it("maps network failures to retryable user-facing errors", () => {
    const error = toAppError(new TypeError("Network request failed"));

    expect(error.kind).toBe("network");
    expect(error.message).toBe("Check your internet connection and try again.");
  });

  it("uses the caller fallback for unexpected errors", () => {
    const error = toAppError(new Error("database internals"), {
      fallbackMessage: "Could not load your profile. Please try again.",
    });

    expect(error.kind).toBe("unexpected");
    expect(error.message).toBe("Could not load your profile. Please try again.");
  });
});
