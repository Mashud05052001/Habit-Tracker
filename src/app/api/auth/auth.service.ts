import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { type IUser, User } from "@/models/User";
import sendEmail from "../components/sendEmail";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRES_IN,
  EMAIL_VERIFICATION_EXPIRES_IN,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_EXPIRES_IN,
  VERIFICATION_EMAIL_SUBJECT,
  verificationEmailHtml,
  verificationEmailText,
} from "./auth.constant";
import type {
  TAuthTokenResult,
  TLoginUser,
  TRegisterResult,
  TRegisterUser,
  TSessionUser,
} from "./auth.interface";
import {
  AuthError,
  buildVerificationUrl,
  createAccessToken,
  createRefreshToken,
  createVerificationToken,
  getAccessTokenExpiryMs,
  getRefreshTokenExpiryMs,
  hashPassword,
  normalizeEmail,
  parseDurationToMs,
  toPublicUser,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
  verifyVerificationToken,
} from "./auth.utils";

function getCookieConfig(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

async function loadVerifiedUserById(userId: string) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user || !user.isVerified) {
    return null;
  }

  return user;
}

async function createAuthTokensForUser(user: IUser): Promise<TAuthTokenResult> {
  const sessionNonce = randomUUID();
  user.refreshTokenNonce = sessionNonce;
  await user.save();

  const accessToken = createAccessToken({
    type: "access",
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    sessionNonce,
  });

  const refreshToken = createRefreshToken({
    type: "refresh",
    userId: user._id.toString(),
    sessionNonce,
  });

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
    user: toPublicUser(user),
  };
}

export async function registerUser(
  payload: TRegisterUser,
  origin?: string
): Promise<TRegisterResult> {
  await connectDB();

  const email = normalizeEmail(payload.email);
  const existingUser = await User.findOne({ email });
  const passwordHash = await hashPassword(payload.password);
  const verificationNonce = randomUUID();
  const verificationExpiresAt = new Date(Date.now() + parseDurationToMs(EMAIL_VERIFICATION_EXPIRES_IN));

  if (existingUser?.isVerified) {
    throw new AuthError(409, "An account with this email already exists");
  }

  const user =
    existingUser ||
    new User({
      name: payload.name,
      email,
      passwordHash,
    });

  user.name = payload.name;
  user.email = email;
  user.passwordHash = passwordHash;
  user.isVerified = false;
  user.verifiedAt = null;
  user.emailVerificationNonce = verificationNonce;
  user.emailVerificationExpiresAt = verificationExpiresAt;
  await user.save();

  const verificationToken = createVerificationToken(
    {
      type: "verify-email",
      userId: user._id.toString(),
      email: user.email,
      nonce: verificationNonce,
    }
  );

  const verificationUrl = buildVerificationUrl(verificationToken, origin);
  const emailResult = await sendEmail({
    to: user.email,
    subject: VERIFICATION_EMAIL_SUBJECT,
    text: verificationEmailText(user.name, verificationUrl),
    html: verificationEmailHtml(user.name, verificationUrl),
  });

  return {
    user: toPublicUser(user),
    emailDelivered: emailResult.delivered,
    verificationExpiresAt: verificationExpiresAt.toISOString(),
    verificationUrl: emailResult.delivered ? undefined : verificationUrl,
    emailPreviewUrl: emailResult.previewUrl,
  };
}

export async function verifyUserEmail(token: string) {
  if (!token) {
    throw new AuthError(400, "Verification token is missing");
  }

  const decoded = verifyVerificationToken(token);
  await connectDB();

  const user = await User.findById(decoded.userId);
  if (!user || normalizeEmail(user.email) !== normalizeEmail(decoded.email)) {
    throw new AuthError(404, "User not found for verification");
  }

  if (user.isVerified) {
    return toPublicUser(user);
  }

  if (!user.emailVerificationNonce || user.emailVerificationNonce !== decoded.nonce) {
    throw new AuthError(400, "Verification link is no longer valid");
  }

  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    throw new AuthError(400, "Verification link has expired");
  }

  user.isVerified = true;
  user.verifiedAt = new Date();
  user.emailVerificationNonce = null;
  user.emailVerificationExpiresAt = null;
  await user.save();

  return toPublicUser(user);
}

export async function loginUser(payload: TLoginUser): Promise<TAuthTokenResult> {
  await connectDB();

  const email = normalizeEmail(payload.email);
  const user = await User.findOne({ email });

  if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
    throw new AuthError(401, "Invalid email or password");
  }

  if (!user.isVerified) {
    throw new AuthError(403, "Verify your email before logging in");
  }

  return createAuthTokensForUser(user);
}

async function getSessionUserFromAccessToken(token?: string | null): Promise<TSessionUser | null> {
  if (!token) return null;

  const decoded = verifyAccessToken(token);
  const user = await loadVerifiedUserById(decoded.userId);
  if (!user || user.refreshTokenNonce !== decoded.sessionNonce) {
    throw new AuthError(401, "Invalid session", "INVALID_SESSION");
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    isVerified: true,
  };
}

async function getSessionUserFromRefreshToken(token?: string | null): Promise<TSessionUser | null> {
  if (!token) return null;

  const decoded = verifyRefreshToken(token);
  const user = await loadVerifiedUserById(decoded.userId);
  if (!user || user.refreshTokenNonce !== decoded.sessionNonce) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    isVerified: true,
  };
}

export async function getSessionUserFromRequest(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  return getSessionUserFromAccessToken(accessToken);
}

export async function getSessionUserFromCookieStore() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null;

  try {
    const accessUser = await getSessionUserFromAccessToken(accessToken);
    if (accessUser) return accessUser;
  } catch (error) {
    if (!(error instanceof AuthError) || error.code !== "ACCESS_TOKEN_EXPIRED") {
      return null;
    }
  }

  return getSessionUserFromRefreshToken(refreshToken);
}

export async function requireSessionUser(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!accessToken) {
    throw new AuthError(401, "Please log in to continue", "AUTH_REQUIRED");
  }

  const user = await getSessionUserFromAccessToken(accessToken);

  if (!user) {
    throw new AuthError(401, "Please log in to continue", "AUTH_REQUIRED");
  }

  return user;
}

export async function refreshAuthTokens(request: NextRequest): Promise<TAuthTokenResult> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!refreshToken) {
    throw new AuthError(401, "Refresh token missing", "REFRESH_TOKEN_MISSING");
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = await loadVerifiedUserById(decoded.userId);
  if (!user || user.refreshTokenNonce !== decoded.sessionNonce) {
    throw new AuthError(401, "Session expired. Please log in again.", "INVALID_REFRESH_TOKEN");
  }

  return createAuthTokensForUser(user);
}

export async function logoutUser(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!refreshToken) return;

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await loadVerifiedUserById(decoded.userId);
    if (!user) return;

    if (user.refreshTokenNonce === decoded.sessionNonce) {
      user.refreshTokenNonce = null;
      await user.save();
    }
  } catch {
    return;
  }
}

export function applyAuthCookies(
  response: NextResponse,
  authResult: Pick<TAuthTokenResult, "accessToken" | "refreshToken">
) {
  response.cookies.set(
    ACCESS_TOKEN_COOKIE_NAME,
    authResult.accessToken,
    getCookieConfig(getAccessTokenExpiryMs())
  );
  response.cookies.set(
    REFRESH_TOKEN_COOKIE_NAME,
    authResult.refreshToken,
    getCookieConfig(getRefreshTokenExpiryMs())
  );
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, "", {
    ...getCookieConfig(getAccessTokenExpiryMs()),
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, "", {
    ...getCookieConfig(getRefreshTokenExpiryMs()),
    maxAge: 0,
  });
}
