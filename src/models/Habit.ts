import mongoose, { Schema, Document, Model } from "mongoose";

// ── Habit definition (stored once, referenced by logs) ───────────────────
export interface IHabit extends Document {
  name: string;
  icon: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HabitSchema = new Schema<IHabit>(
  {
    name:   { type: String, required: true, trim: true, maxlength: 80 },
    icon:   { type: String, default: "✅", maxlength: 4 },
    order:  { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ── Daily log — one doc per (habit × year × month × day) ─────────────────
export interface ILog extends Document {
  habitId: mongoose.Types.ObjectId;
  year:    number;
  month:   number; // 0-indexed to match JS Date
  day:     number;
  done:    boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LogSchema = new Schema<ILog>(
  {
    habitId: { type: Schema.Types.ObjectId, ref: "Habit", required: true },
    year:    { type: Number, required: true },
    month:   { type: Number, required: true },
    day:     { type: Number, required: true },
    done:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ensure only one log per habit per day
LogSchema.index({ habitId: 1, year: 1, month: 1, day: 1 }, { unique: true });

// ── Model helpers (handles hot-reload in dev) ─────────────────────────────
export const Habit: Model<IHabit> =
  (mongoose.models.Habit as Model<IHabit>) ||
  mongoose.model<IHabit>("Habit", HabitSchema);

export const Log: Model<ILog> =
  (mongoose.models.Log as Model<ILog>) ||
  mongoose.model<ILog>("Log", LogSchema);
