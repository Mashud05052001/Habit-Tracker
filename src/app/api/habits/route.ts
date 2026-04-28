import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { Habit } from "@/models/Habit";

export const dynamic = "force-dynamic";

function getStatusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 500;
}

// GET /api/habits — list all active habits
export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const habits = await Habit.find({ active: true, userId: user.id }).sort({ order: 1, createdAt: 1 });
    return NextResponse.json({ habits });
  } catch (err) {
    console.error("[GET /api/habits]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch habits" },
      { status: getStatusCode(err) }
    );
  }
}

// POST /api/habits — create a new habit
export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const body = await req.json();
    const { name, icon } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const count = await Habit.countDocuments({ active: true, userId: user.id });
    const habit = await Habit.create({
      userId: user.id,
      name: name.trim(),
      icon: icon?.trim() || "✅",
      order: count,
    });

    return NextResponse.json({ habit }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/habits]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create habit" },
      { status: getStatusCode(err) }
    );
  }
}
