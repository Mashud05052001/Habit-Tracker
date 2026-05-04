import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { UserPushSubscription } from "@/models/PushSubscription";

export const runtime = "nodejs";

type PushSubscriptionRequest = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    auth?: unknown;
    p256dh?: unknown;
  };
};

function isValidSubscription(
  subscription: PushSubscriptionRequest,
): subscription is {
  endpoint: string;
  expirationTime?: number | null;
  keys: { auth: string; p256dh: string };
} {
  return (
    typeof subscription?.endpoint === "string" &&
    subscription.endpoint.length > 0 &&
    typeof subscription.keys?.auth === "string" &&
    subscription.keys.auth.length > 0 &&
    typeof subscription.keys?.p256dh === "string" &&
    subscription.keys.p256dh.length > 0 &&
    (subscription.expirationTime === null ||
      subscription.expirationTime === undefined ||
      typeof subscription.expirationTime === "number")
  );
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request);
    const { subscription } = await request.json();

    if (!isValidSubscription(subscription)) {
      return NextResponse.json(
        { error: "Invalid subscription" },
        { status: 400 },
      );
    }

    await connectDB();

    await UserPushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: {
            auth: subscription.keys.auth,
            p256dh: subscription.keys.p256dh,
          },
          userAgent: request.headers.get("user-agent") ?? "",
          userId: currentUser.id,
        },
      },
      { upsert: true },
    );

    return NextResponse.json({
      success: true,
      message: "Subscription stored successfully",
    });
  } catch (error: any) {
    if (error?.statusCode !== 401) {
      console.error("Subscription error:", error);
    }
    return NextResponse.json(
      { error: error?.message || "Failed to store subscription" },
      { status: error?.statusCode || 500 },
    );
  }
}
