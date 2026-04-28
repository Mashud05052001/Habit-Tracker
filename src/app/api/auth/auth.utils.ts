import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { TPublicUser, TSessionTokenPayload, TVerificationTokenPayload } from "./auth.interface";

const scryptAsync = promisify(scryptCallback);

type TDecodedToken<T> = T & {
  exp: number;
  iat: number;
};

export class AuthError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, savedHash] = storedHash.split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const nextHash = (await scryptAsync(password, salt, 64)) as Buffer;
  const savedHashBuffer = Buffer.from(savedHash, "hex");

  if (savedHashBuffer.length !== nextHash.length) {
    return false;
  }

  return timingSafeEqual(savedHashBuffer, nextHash);
}

function getAuthSecret() {
  return process.env.AUTH_JWT_SECRET || "local-dev-auth-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSignedToken<T extends Record<string, unknown>>(
  payload: T,
  expiresInMs: number
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.floor(expiresInMs / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: issuedAt, exp: expiresAt }));
  const value = `${header}.${body}`;
  const signature = signTokenValue(value, getAuthSecret());

  return `${value}.${signature}`;
}

export function verifySignedToken<T extends Record<string, unknown>>(token: string) {
  const [header, body, signature] = token.split(".");

  if (!header || !body || !signature) {
    throw new AuthError(400, "Invalid token");
  }

  const expectedSignature = signTokenValue(`${header}.${body}`, getAuthSecret());
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new AuthError(400, "Invalid token");
  }

  const decoded = JSON.parse(base64UrlDecode(body)) as TDecodedToken<T>;

  if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError(400, "Verification link has expired");
  }

  return decoded;
}

export function createSessionToken(payload: TSessionTokenPayload, expiresInMs: number) {
  return createSignedToken(payload, expiresInMs);
}

export function verifySessionToken(token: string) {
  const decoded = verifySignedToken<TSessionTokenPayload>(token);

  if (decoded.type !== "session") {
    throw new AuthError(400, "Invalid session");
  }

  return decoded;
}

export function createVerificationToken(
  payload: TVerificationTokenPayload,
  expiresInMs: number
) {
  return createSignedToken(payload, expiresInMs);
}

export function verifyVerificationToken(token: string) {
  const decoded = verifySignedToken<TVerificationTokenPayload>(token);

  if (decoded.type !== "verify-email") {
    throw new AuthError(400, "Invalid verification token");
  }

  return decoded;
}

export function buildVerificationUrl(token: string, origin?: string) {
  const baseUrl = origin || process.env.APP_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

export function toPublicUser(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  isVerified: boolean;
}): TPublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    isVerified: user.isVerified,
  };
}
