import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { Habit, Log } from "@/models/Habit";

export const dynamic = "force-dynamic";

function getStatusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 500;
}

// GET /api/stats?year=2024&month=10
// Returns aggregated statistics for the given month
export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const { searchParams } = new URL(req.url);
    const year  = parseInt(searchParams.get("year")  ?? "");
    const month = parseInt(searchParams.get("month") ?? "");

    if (isNaN(year) || isNaN(month)) {
      return NextResponse.json({ error: "year and month required" }, { status: 400 });
    }

    const habits = await Habit.find({ active: true, userId: user.id }).sort({ order: 1 });
    const logs   = await Log.find({ userId: user.id, year, month, done: true });

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Per-habit stats
    const habitStats = habits.map((h) => {
      const hLogs = logs.filter((l) => l.habitId.toString() === h._id.toString());
      const completed = hLogs.length;
      const streak = calcStreak(hLogs, daysInMonth, new Date());

      return {
        habitId:   h._id,
        name:      h.name,
        icon:      h.icon,
        completed,
        goal:      daysInMonth,
        pct:       daysInMonth ? Math.round((completed / daysInMonth) * 100) : 0,
        streak,
      };
    });

    // Daily completion counts
    const dailyCounts: Record<number, number> = {};
    for (const log of logs) {
      dailyCounts[log.day] = (dailyCounts[log.day] ?? 0) + 1;
    }

    const perfectDays = Object.values(dailyCounts).filter(
      (c) => c === habits.length && habits.length > 0
    ).length;

    const totalDone = logs.length;
    const totalPossible = habits.length * daysInMonth;
    const overallPct = totalPossible
      ? Math.round((totalDone / totalPossible) * 100)
      : 0;

    return NextResponse.json({
      overallPct,
      totalDone,
      totalPossible,
      perfectDays,
      habitStats,
      dailyCounts,
    });
  } catch (err) {
    console.error("[GET /api/stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch stats" },
      { status: getStatusCode(err) }
    );
  }
}

function calcStreak(
  logs: { day: number }[],
  daysInMonth: number,
  now: Date
): number {
  const doneDays = new Set(logs.map((l) => l.day));
  let streak = 0;
  for (let d = daysInMonth; d >= 1; d--) {
    if (doneDays.has(d)) streak++;
    else break;
  }
  return streak;
}
