import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthRoutes } from "./auth.route";
import {
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

function buildErrorResponse(error: unknown) {
  const statusCode = error instanceof AuthError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Something went wrong";
  const code = error instanceof AuthError ? error.code : undefined;

  return NextResponse.json({ error: message, code }, { status: statusCode });
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

    applyAuthCookies(response, result);
    return response;
  } catch (error) {
    return buildErrorResponse(error);
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
        applyAuthCookies(response, result);
        return response;
      } catch (refreshError) {
        return buildErrorResponse(refreshError);
      }
    }

    return buildErrorResponse(error);
  }
}
