import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/app/api/auth/auth.service";
import { connectDB } from "@/lib/mongodb";
import { Habit, Log } from "@/models/Habit";

interface Params { params: { id: string } }

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

function getStatusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 500;
}

const CASE_INSENSITIVE_COLLATION = { locale: "en", strength: 2 };

function normalizeHabitName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// PATCH /api/habits/[id] — update habit fields
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(req);
    await connectDB();
    const { id } = params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const updates: Partial<{
      name: string;
      icon: string;
      order: number;
      active: boolean;
    }> = {};
    if (body.name !== undefined) {
      const name = normalizeHabitName(body.name);
      if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }

      updates.name = name;
    }
    if (body.icon !== undefined) updates.icon = body.icon.trim();
    if (body.order !== undefined) updates.order = body.order;
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
      }

      updates.active = body.active;
      if (body.active) {
        updates.order = await Habit.countDocuments({ userId: user.id, active: true });
      }
    }

    const currentHabit = await Habit.findOne({ _id: id, userId: user.id });
    if (!currentHabit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextName = updates.name ?? currentHabit.name;
    const willBeActive = updates.active ?? currentHabit.active;
    if (willBeActive) {
      const activeDuplicate = await Habit.findOne({
        _id: { $ne: id },
        active: true,
        name: nextName,
        userId: user.id,
      }).collation(CASE_INSENSITIVE_COLLATION);

      if (activeDuplicate) {
        return NextResponse.json(
          {
            duplicateType: "active",
            error: `A habit named "${nextName}" already exists.`,
          },
          { status: 409 }
        );
      }

      if (updates.name !== undefined) {
        const deletedDuplicate = await Habit.findOne({
          _id: { $ne: id },
          active: false,
          name: nextName,
          userId: user.id,
        }).collation(CASE_INSENSITIVE_COLLATION);

        if (deletedDuplicate) {
          const logCount = await Log.countDocuments({
            habitId: deletedDuplicate._id,
            userId: user.id,
          });

          return NextResponse.json(
            {
              duplicateType: "deleted",
              error:
                "This habit name already exists in Deleted Habits. Restore it from there instead.",
              habit: deletedDuplicate,
              logCount,
            },
            { status: 409 }
          );
        }
      }
    }

    const habit = await Habit.findOneAndUpdate(
      { _id: id, userId: user.id },
      updates,
      { new: true }
    );

    return NextResponse.json({ habit });
  } catch (err) {
    console.error("[PATCH /api/habits/:id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update habit" },
      { status: getStatusCode(err) }
    );
  }
}

// DELETE /api/habits/[id] — soft delete by default, permanent with ?permanent=true
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(_req);
    await connectDB();
    const { id } = params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { searchParams } = new URL(_req.url);
    const permanent = searchParams.get("permanent") === "true";

    if (permanent) {
      const habit = await Habit.findOne({ _id: id, userId: user.id });
      if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

      await Log.deleteMany({ habitId: id, userId: user.id });
      await Habit.deleteOne({ _id: id, userId: user.id });

      return NextResponse.json({
        success: true,
        deletedId: id,
        permanent: true,
      });
    }

    const habit = await Habit.findOneAndUpdate(
      { _id: id, userId: user.id },
      { active: false },
      { new: true }
    );
    if (!habit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, deletedId: id, habit });
  } catch (err) {
    console.error("[DELETE /api/habits/:id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete habit" },
      { status: getStatusCode(err) }
    );
  }
}
