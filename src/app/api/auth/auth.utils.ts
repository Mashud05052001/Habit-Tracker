import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import jwt, { JsonWebTokenError, TokenExpiredError, type JwtPayload, type SignOptions } from "jsonwebtoken";
import { promisify } from "util";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  EMAIL_VERIFICATION_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from "./auth.constant";
import type {
  TAccessTokenPayload,
  TPublicUser,
  TRefreshTokenPayload,
  TVerificationTokenPayload,
} from "./auth.interface";

const scryptAsync = promisify(scryptCallback);

export class AuthError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
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

export function parseDurationToMs(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match) {
    throw new AuthError(500, `Invalid duration value: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new AuthError(500, `Unsupported duration unit: ${unit}`);
  }
}

function getAccessTokenSecret() {
  return (
    process.env.JWT_ACCESS_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    "local-dev-access-secret"
  );
}

function getRefreshTokenSecret() {
  return (
    process.env.JWT_REFRESH_SECRET ||
    process.env.REFRESH_TOKEN_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    "local-dev-refresh-secret"
  );
}

function getVerificationTokenSecret() {
  return process.env.EMAIL_VERIFICATION_TOKEN_SECRET || process.env.AUTH_JWT_SECRET || getAccessTokenSecret();
}

function signJwtToken(payload: object, secret: string, expiresIn: string) {
  return jwt.sign(payload, secret, {
    expiresIn,
  } as SignOptions);
}

function verifyJwtToken<T extends JwtPayload>(
  token: string,
  secret: string,
  {
    expiredMessage,
    expiredCode,
    invalidMessage,
    invalidCode,
    expiredStatusCode = 401,
    invalidStatusCode = 401,
  }: {
    expiredMessage: string;
    expiredCode: string;
    invalidMessage: string;
    invalidCode: string;
    expiredStatusCode?: number;
    invalidStatusCode?: number;
  }
) {
  try {
    return jwt.verify(token, secret) as T;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new AuthError(expiredStatusCode, expiredMessage, expiredCode);
    }

    if (error instanceof JsonWebTokenError) {
      throw new AuthError(invalidStatusCode, invalidMessage, invalidCode);
    }

    throw error;
  }
}

export function getAccessTokenExpiryMs() {
  return parseDurationToMs(ACCESS_TOKEN_EXPIRES_IN);
}

export function getRefreshTokenExpiryMs() {
  return parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN);
}

export function createAccessToken(payload: TAccessTokenPayload) {
  return signJwtToken(payload, getAccessTokenSecret(), ACCESS_TOKEN_EXPIRES_IN);
}

export function verifyAccessToken(token: string) {
  const decoded = verifyJwtToken<TAccessTokenPayload & JwtPayload>(token, getAccessTokenSecret(), {
    expiredMessage: "Access token expired",
    expiredCode: "ACCESS_TOKEN_EXPIRED",
    invalidMessage: "Invalid access token",
    invalidCode: "INVALID_ACCESS_TOKEN",
  });

  if (decoded.type !== "access") {
    throw new AuthError(401, "Invalid access token", "INVALID_ACCESS_TOKEN");
  }

  return decoded;
}

export function createRefreshToken(payload: TRefreshTokenPayload) {
  return signJwtToken(payload, getRefreshTokenSecret(), REFRESH_TOKEN_EXPIRES_IN);
}

export function verifyRefreshToken(token: string) {
  const decoded = verifyJwtToken<TRefreshTokenPayload & JwtPayload>(token, getRefreshTokenSecret(), {
    expiredMessage: "Refresh token expired",
    expiredCode: "REFRESH_TOKEN_EXPIRED",
    invalidMessage: "Invalid refresh token",
    invalidCode: "INVALID_REFRESH_TOKEN",
  });

  if (decoded.type !== "refresh") {
    throw new AuthError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  return decoded;
}

export function createVerificationToken(
  payload: TVerificationTokenPayload
) {
  return signJwtToken(payload, getVerificationTokenSecret(), EMAIL_VERIFICATION_EXPIRES_IN);
}

export function verifyVerificationToken(token: string) {
  const decoded = verifyJwtToken<TVerificationTokenPayload & JwtPayload>(
    token,
    getVerificationTokenSecret(),
    {
      expiredMessage: "Verification link has expired",
      expiredCode: "VERIFICATION_TOKEN_EXPIRED",
      invalidMessage: "Invalid verification token",
      invalidCode: "INVALID_VERIFICATION_TOKEN",
      expiredStatusCode: 400,
      invalidStatusCode: 400,
    }
  );

  if (decoded.type !== "verify-email") {
    throw new AuthError(400, "Invalid verification token", "INVALID_VERIFICATION_TOKEN");
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
