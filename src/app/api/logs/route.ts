import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { Habit, Log } from "@/models/Habit";

export const dynamic = "force-dynamic";

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Dhaka";
const LOG_EDIT_WINDOW_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getTodayInAppTimeZone() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );

    return {
      year: values.year,
      month: values.month - 1,
      day: values.day,
    };
  } catch {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      day: today.getDate(),
    };
  }
}

function getUtcDayNumber(year: number, month: number, day: number) {
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / MS_PER_DAY);
}

function canUpdateLogDate(year: number, month: number, day: number) {
  const today = getTodayInAppTimeZone();
  const targetDay = getUtcDayNumber(year, month, day);
  const todayDay = getUtcDayNumber(today.year, today.month, today.day);

  if (targetDay === null || todayDay === null) {
    return false;
  }

  const ageInDays = todayDay - targetDay;
  return ageInDays >= 0 && ageInDays < LOG_EDIT_WINDOW_DAYS;
}

function getStatusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 500;
}

// GET /api/logs?year=2024&month=10
// Returns all log documents for the given year+month
export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const { searchParams } = new URL(req.url);
    const year  = parseInt(searchParams.get("year")  ?? "");
    const month = parseInt(searchParams.get("month") ?? "");

    if (isNaN(year) || isNaN(month)) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 });
    }

    const activeHabitIds = await Habit.find({
      userId: user.id,
      active: true,
    }).distinct("_id");
    const logs = await Log.find({
      userId: user.id,
      year,
      month,
      habitId: { $in: activeHabitIds },
    });
    return NextResponse.json({ logs });
  } catch (err) {
    console.error("[GET /api/logs]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch logs" },
      { status: getStatusCode(err) }
    );
  }
}

// POST /api/logs — toggle a habit for a specific day
// Body: { habitId, year, month, day, done? }
export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    const body = await req.json();
    const habitId = body.habitId;
    const year = Number(body.year);
    const month = Number(body.month);
    const day = Number(body.day);
    const hasExplicitDone = typeof body.done === "boolean";

    if (!habitId || isNaN(year) || isNaN(month) || isNaN(day)) {
      return NextResponse.json({ error: "habitId, year, month, day required" }, { status: 400 });
    }

    if (!canUpdateLogDate(year, month, day)) {
      return NextResponse.json(
        { error: "Only today or yesterday can be marked" },
        { status: 400 }
      );
    }

    await connectDB();

    const habit = await Habit.findOne({ _id: habitId, userId: user.id, active: true });
    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    const logFilter = { userId: user.id, habitId, year, month, day };

    if (hasExplicitDone) {
      if (body.done === false) {
        const log = await Log.findOneAndUpdate(
          logFilter,
          {
            $setOnInsert: {
              userId: user.id,
              habitId,
              year,
              month,
              day,
              done: false,
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return NextResponse.json({ log });
      }

      const log = await Log.findOneAndUpdate(
        logFilter,
        {
          $set: { done: true },
          $setOnInsert: {
            userId: user.id,
            habitId,
            year,
            month,
            day,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return NextResponse.json({ log });
    }

    // Find existing log
    const existing = await Log.findOne(logFilter);

    if (existing) {
      // Toggle done field
      existing.done = !existing.done;
      await existing.save();
      return NextResponse.json({ log: existing });
    }

    // Create new log (done=true on first click)
    const log = await Log.create({ userId: user.id, habitId, year, month, day, done: true });
    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/logs]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to toggle log" },
      { status: getStatusCode(err) }
    );
  }
}
