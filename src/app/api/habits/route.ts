import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Habit } from "@/models/Habit";

// GET /api/habits — list all active habits
export async function GET() {
  try {
    await connectDB();
    const habits = await Habit.find({ active: true }).sort({ order: 1, createdAt: 1 });
    return NextResponse.json({ habits });
  } catch (err) {
    console.error("[GET /api/habits]", err);
    return NextResponse.json({ error: "Failed to fetch habits" }, { status: 500 });
  }
}

// POST /api/habits — create a new habit
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { name, icon } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const count = await Habit.countDocuments({ active: true });
    const habit = await Habit.create({
      name: name.trim(),
      icon: icon?.trim() || "✅",
      order: count,
    });

    return NextResponse.json({ habit }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/habits]", err);
    return NextResponse.json({ error: "Failed to create habit" }, { status: 500 });
  }
}
