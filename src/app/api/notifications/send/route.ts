import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { UserPushSubscription } from "@/models/PushSubscription";

export const runtime = "nodejs";

type WebPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

function getVapidConfig() {
  const email = process.env.VAPID_EMAIL;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!email || !privateKey || !publicKey) {
    return null;
  }

  return { email, privateKey, publicKey };
}

function normalizeSubscription(
  subscription: any,
): WebPushSubscriptionPayload | null {
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint ||
    typeof subscription.keys?.auth !== "string" ||
    typeof subscription.keys?.p256dh !== "string"
  ) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number"
        ? subscription.expirationTime
        : null,
    keys: {
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireSessionUser(request);
    const vapidConfig = getVapidConfig();

    if (!vapidConfig) {
      return NextResponse.json(
        {
          error:
            "Missing VAPID configuration. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL.",
        },
        { status: 500 },
      );
    }

    webpush.setVapidDetails(
      vapidConfig.email,
      vapidConfig.publicKey,
      vapidConfig.privateKey,
    );

    const {
      body,
      icon,
      subscription: requestSubscription,
      tag,
      title,
      url,
    } = await request.json();

    const payload = JSON.stringify({
      body: body || "Update your habits",
      data: { url: url || "/" },
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: tag || "habitee-reminder",
      title: title || "Daily Reminder",
      ...(typeof icon === "string" && icon ? { icon } : {}),
    });

    const directSubscription = normalizeSubscription(requestSubscription);
    let subscriptions: WebPushSubscriptionPayload[] = [];

    if (directSubscription) {
      subscriptions = [directSubscription];
    } else {
      await connectDB();
      const storedSubscriptions = await UserPushSubscription.find({
        userId: currentUser.id,
      }).lean();

      subscriptions = storedSubscriptions.map((storedSubscription) => ({
        endpoint: storedSubscription.endpoint,
        expirationTime: storedSubscription.expirationTime ?? null,
        keys: storedSubscription.keys,
      }));
    }

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "No push subscription found" },
        { status: 404 },
      );
    }

    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(subscription, payload),
      ),
    );

    const expiredEndpoints: string[] = [];
    const failedResults: Array<{ endpoint: string; error: string }> = [];

    results.forEach((result, index) => {
      const endpoint = subscriptions[index]?.endpoint ?? "";

      if (result.status === "fulfilled") {
        return;
      }

      const error: any = result.reason;

      if (error?.statusCode === 404 || error?.statusCode === 410) {
        expiredEndpoints.push(endpoint);
        return;
      }

      failedResults.push({
        endpoint,
        error: error?.body || error?.message || "Unknown push error",
      });
    });

    if (expiredEndpoints.length > 0) {
      await connectDB();
      await UserPushSubscription.deleteMany({
        endpoint: { $in: expiredEndpoints },
      });
    }

    const sentCount =
      subscriptions.length - expiredEndpoints.length - failedResults.length;

    if (sentCount === 0) {
      const status = expiredEndpoints.length > 0 ? 410 : 500;
      return NextResponse.json(
        {
          error:
            expiredEndpoints.length > 0
              ? "Subscription expired"
              : failedResults[0]?.error || "Failed to send notification",
          expired: expiredEndpoints.length > 0,
          failed: failedResults,
        },
        { status },
      );
    }

    return NextResponse.json({
      expired: expiredEndpoints.length,
      failed: failedResults.length,
      success: true,
      sent: sentCount,
    });
  } catch (error: any) {
    if (error?.statusCode !== 401) {
      console.error("Push notification error:", error);
    }
    return NextResponse.json(
      { error: error?.message || "Failed to send notification" },
      { status: error?.statusCode || 500 },
    );
  }
}
