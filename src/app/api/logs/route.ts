import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Log } from "@/models/Habit";

function isTodayDate(year: number, month: number, day: number) {
  const today = new Date();
  return (
    year === today.getFullYear() &&
    month === today.getMonth() &&
    day === today.getDate()
  );
}

// GET /api/logs?year=2024&month=10
// Returns all log documents for the given year+month
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const year  = parseInt(searchParams.get("year")  ?? "");
    const month = parseInt(searchParams.get("month") ?? "");

    if (isNaN(year) || isNaN(month)) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 });
    }

    const logs = await Log.find({ year, month });
    return NextResponse.json({ logs });
  } catch (err) {
    console.error("[GET /api/logs]", err);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

// POST /api/logs — toggle a habit for a specific day
// Body: { habitId, year, month, day }
export async function POST(req: NextRequest) {
  try {
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

    // Find existing log
    const existing = await Log.findOne({ habitId, year, month, day });

    if (existing) {
      // Toggle done field
      existing.done = !existing.done;
      await existing.save();
      return NextResponse.json({ log: existing });
    }

    // Create new log (done=true on first click)
    const log = await Log.create({ habitId, year, month, day, done: true });
    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/logs]", err);
    return NextResponse.json({ error: "Failed to toggle log" }, { status: 500 });
  }
}
