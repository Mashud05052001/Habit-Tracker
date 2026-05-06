import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE_NAME } from "./auth.constant";
import { AuthRoutes } from "./auth.route";
import {
  applyAccessTokenCookie,
  applyAuthCookies,
  clearAuthCookies,
  getSessionUserFromRequest,
  loginUser,
  logoutUser,
  refreshAuthTokens,
  registerUser,
  verifyUserEmail,
} from "./auth.service";
import { validateLoginPayload, validateRegisterPayload } from "./auth.validation";
import { AuthError } from "./auth.utils";

function shouldClearAuthCookies(error: unknown) {
  return (
    error instanceof AuthError &&
    [
      "REFRESH_TOKEN_EXPIRED",
      "INVALID_REFRESH_TOKEN",
      "REFRESH_TOKEN_MISSING",
    ].includes(error.code ?? "")
  );
}

function buildErrorResponse(error: unknown, clearCookies = false) {
  const statusCode = error instanceof AuthError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Something went wrong";
  const code = error instanceof AuthError ? error.code : undefined;

  const response = NextResponse.json({ error: message, code }, { status: statusCode });
  if (clearCookies) {
    clearAuthCookies(response);
  }

  return response;
}

export async function registerController(request: NextRequest) {
  try {
    const payload = validateRegisterPayload(await request.json());
    const result = await registerUser(payload, new URL(request.url).origin);

    return NextResponse.json(
      {
        message: "Registration successful. Verify your email before logging in.",
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    return buildErrorResponse(error);
  }
}

export async function loginController(request: NextRequest) {
  try {
    const payload = validateLoginPayload(await request.json());
    const result = await loginUser(payload);
    const response = NextResponse.json({
      message: "Login successful",
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      user: result.user,
    });

    applyAuthCookies(response, result);
    return response;
  } catch (error) {
    return buildErrorResponse(error);
  }
}

export async function refreshController(request: NextRequest) {
  try {
    const result = await refreshAuthTokens(request);
    const response = NextResponse.json({
      message: "Access token refreshed",
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      user: result.user,
    });

    applyAccessTokenCookie(response, result);
    return response;
  } catch (error) {
    return buildErrorResponse(error, shouldClearAuthCookies(error));
  }
}

export async function logoutController(request: NextRequest) {
  await logoutUser(request);
  const response = NextResponse.json({ message: "Logged out" });
  clearAuthCookies(response);
  return response;
}

export async function verifyEmailController(request: NextRequest) {
  const loginUrl = new URL(AuthRoutes.loginPage, request.url);
  const token = new URL(request.url).searchParams.get("token") ?? "";

  try {
    await verifyUserEmail(token);
    loginUrl.searchParams.set("verified", "1");
  } catch (error) {
    loginUrl.searchParams.set("verified", "0");
    loginUrl.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Verification failed"
    );
  }

  return NextResponse.redirect(loginUrl);
}

export async function sessionController(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
    if (!accessToken) {
      const result = await refreshAuthTokens(request);
      const response = NextResponse.json({
        user: result.user,
        accessToken: result.accessToken,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
      });
      applyAccessTokenCookie(response, result);
      return response;
    }

    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthError && error.code === "ACCESS_TOKEN_EXPIRED") {
      try {
        const result = await refreshAuthTokens(request);
        const response = NextResponse.json({
          user: result.user,
          accessToken: result.accessToken,
          accessTokenExpiresIn: result.accessTokenExpiresIn,
        });
        applyAccessTokenCookie(response, result);
        return response;
      } catch (refreshError) {
        return buildErrorResponse(refreshError, shouldClearAuthCookies(refreshError));
      }
    }

    return buildErrorResponse(error, shouldClearAuthCookies(error));
  }
}
