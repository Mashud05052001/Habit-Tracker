import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { Habit, Log } from "@/models/Habit";

export const dynamic = "force-dynamic";

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Dhaka";

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

function isTodayDate(year: number, month: number, day: number) {
  const today = getTodayInAppTimeZone();
  return (
    year === today.year &&
    month === today.month &&
    day === today.day
  );
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
// Body: { habitId, year, month, day }
export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    const body = await req.json();
    const habitId = body.habitId;
    const year = Number(body.year);
    const month = Number(body.month);
    const day = Number(body.day);

    if (!habitId || isNaN(year) || isNaN(month) || isNaN(day)) {
      return NextResponse.json({ error: "habitId, year, month, day required" }, { status: 400 });
    }

    if (!isTodayDate(year, month, day)) {
      return NextResponse.json(
        { error: "Only today's box can be marked" },
        { status: 400 }
      );
    }

    await connectDB();

    const habit = await Habit.findOne({ _id: habitId, userId: user.id, active: true });
    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    // Find existing log
    const existing = await Log.findOne({ userId: user.id, habitId, year, month, day });

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
