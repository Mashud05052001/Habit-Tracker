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

const CASE_INSENSITIVE_COLLATION = { locale: "en", strength: 2 };

function normalizeHabitName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// GET /api/habits — list habits
export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const filter: { userId: string; active?: boolean } = { userId: user.id };

    if (status === "deleted") {
      filter.active = false;
    } else if (status !== "all") {
      filter.active = true;
    }

    const habits = await Habit.find(filter).sort({
      active: -1,
      order: 1,
      createdAt: 1,
    });
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
    const name = normalizeHabitName(body.name);
    const icon =
      typeof body.icon === "string" && body.icon.trim()
        ? body.icon.trim()
        : "✅";
    const createNew = body.createNew === true;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const activeDuplicate = await Habit.findOne({
      active: true,
      name,
      userId: user.id,
    }).collation(CASE_INSENSITIVE_COLLATION);

    if (activeDuplicate) {
      return NextResponse.json(
        {
          duplicateType: "active",
          error: `A habit named "${name}" already exists.`,
        },
        { status: 409 }
      );
    }

    const deletedDuplicate = await Habit.findOne({
      active: false,
      name,
      userId: user.id,
    })
      .sort({ updatedAt: -1 })
      .collation(CASE_INSENSITIVE_COLLATION);

    if (deletedDuplicate && !createNew) {
      const logCount = await Log.countDocuments({
        habitId: deletedDuplicate._id,
        userId: user.id,
      });

      return NextResponse.json(
        {
          duplicateType: "deleted",
          error: `A deleted habit named "${name}" already exists.`,
          habit: deletedDuplicate,
          logCount,
        },
        { status: 409 }
      );
    }

    const count = await Habit.countDocuments({ active: true, userId: user.id });
    const habit = await Habit.create({
      userId: user.id,
      name,
      icon,
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
