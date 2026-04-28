import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Habit, Log } from "@/models/Habit";
import mongoose from "mongoose";

interface Params { params: { id: string } }

// PATCH /api/habits/[id] — update name or icon
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const { id } = params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Partial<{ name: string; icon: string; order: number }> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.icon !== undefined) updates.icon = body.icon.trim();
    if (body.order !== undefined) updates.order = body.order;

    const habit = await Habit.findByIdAndUpdate(id, updates, { new: true });
    if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ habit });
  } catch (err) {
    console.error("[PATCH /api/habits/:id]", err);
    return NextResponse.json({ error: "Failed to update habit" }, { status: 500 });
  }
}

// DELETE /api/habits/[id] — soft delete (sets active=false)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const { id } = params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const habit = await Habit.findByIdAndUpdate(id, { active: false }, { new: true });
    if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Also delete all logs for this habit
    await Log.deleteMany({ habitId: id });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("[DELETE /api/habits/:id]", err);
    return NextResponse.json({ error: "Failed to delete habit" }, { status: 500 });
  }
}
