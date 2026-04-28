import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import sendEmail from "../components/sendEmail";
import {
  AUTH_COOKIE_NAME,
  EMAIL_VERIFICATION_DURATION_MS,
  SESSION_DURATION_MS,
  VERIFICATION_EMAIL_SUBJECT,
  verificationEmailHtml,
  verificationEmailText,
} from "./auth.constant";
import type { TLoginUser, TRegisterResult, TRegisterUser, TSessionUser } from "./auth.interface";
import {
  AuthError,
  buildVerificationUrl,
  createSessionToken,
  createVerificationToken,
  hashPassword,
  normalizeEmail,
  toPublicUser,
  verifyPassword,
  verifySessionToken,
  verifyVerificationToken,
} from "./auth.utils";

function getCookieConfig() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
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
  const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_DURATION_MS);

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
    },
    EMAIL_VERIFICATION_DURATION_MS
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

export async function loginUser(payload: TLoginUser) {
  await connectDB();

  const email = normalizeEmail(payload.email);
  const user = await User.findOne({ email });

  if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
    throw new AuthError(401, "Invalid email or password");
  }

  if (!user.isVerified) {
    throw new AuthError(403, "Verify your email before logging in");
  }

  const sessionToken = createSessionToken(
    {
      type: "session",
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    },
    SESSION_DURATION_MS
  );

  return {
    sessionToken,
    user: toPublicUser(user),
  };
}

async function resolveSessionUser(token?: string | null): Promise<TSessionUser | null> {
  if (!token) {
    return null;
  }

  try {
    const decoded = verifySessionToken(token);
    await connectDB();

    const user = await User.findById(decoded.userId);
    if (!user || !user.isVerified) {
      return null;
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isVerified: true,
    };
  } catch {
    return null;
  }
}

export async function getSessionUserFromRequest(request: NextRequest) {
  return resolveSessionUser(request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null);
}

export async function getSessionUserFromCookieStore() {
  return resolveSessionUser(cookies().get(AUTH_COOKIE_NAME)?.value ?? null);
}

export async function requireSessionUser(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);

  if (!user) {
    throw new AuthError(401, "Please log in to continue");
  }

  return user;
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, getCookieConfig());
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...getCookieConfig(),
    maxAge: 0,
  });
}
