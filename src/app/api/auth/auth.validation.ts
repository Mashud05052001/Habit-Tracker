import type { TLoginUser, TRegisterUser } from "./auth.interface";
import { AuthError, normalizeEmail } from "./auth.utils";

function readBody(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new AuthError(400, "Invalid request body");
  }

  return payload as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  if (typeof value !== "string") {
    throw new AuthError(400, `${key} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new AuthError(400, `${key} is required`);
  }

  return trimmed;
}

export function validateRegisterPayload(payload: unknown): TRegisterUser {
  const body = readBody(payload);
  const name = readString(body, "name");
  const email = normalizeEmail(readString(body, "email"));
  const password = readString(body, "password");
  const confirmPassword = readString(body, "confirmPassword");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, "Please provide a valid email");
  }

  if (name.length > 80) {
    throw new AuthError(400, "Name must be 80 characters or fewer");
  }

  if (password.length < 8) {
    throw new AuthError(400, "Password must be at least 8 characters");
  }

  if (password !== confirmPassword) {
    throw new AuthError(400, "Password and confirm password must match");
  }

  return { name, email, password, confirmPassword };
}

export function validateLoginPayload(payload: unknown): TLoginUser {
  const body = readBody(payload);
  const email = normalizeEmail(readString(body, "email"));
  const password = readString(body, "password");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, "Please provide a valid email");
  }

  return { email, password };
}
