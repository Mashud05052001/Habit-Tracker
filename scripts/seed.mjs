/**
 * Seed script — run once to populate default habits
 * Usage: node scripts/seed.mjs
 * Make sure MONGODB_URI is set in .env.local
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
try {
  const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {
  console.error("Could not read .env.local — set MONGODB_URI manually");
}

const require = createRequire(import.meta.url);
const mongoose = require("mongoose");

const HABITS = [
  { name: "Wake up at 05:00", icon: "⏰", order: 0 },
  { name: "Gym",              icon: "💪", order: 1 },
  { name: "Reading / Learning", icon: "📚", order: 2 },
  { name: "Budget Tracking",  icon: "💰", order: 3 },
  { name: "Project Work",     icon: "🎯", order: 4 },
  { name: "No Alcohol",       icon: "🍃", order: 5 },
  { name: "Social Media Detox", icon: "🌿", order: 6 },
  { name: "Goal Journaling",  icon: "📝", order: 7 },
  { name: "Cold Shower",      icon: "🚿", order: 8 },
];

const HabitSchema = new mongoose.Schema(
  { name: String, icon: String, order: Number, active: { type: Boolean, default: true } },
  { timestamps: true }
);
const Habit = mongoose.models.Habit || mongoose.model("Habit", HabitSchema);

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_username>")) {
    console.error("❌  Please set a real MONGODB_URI in .env.local first");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("✅ Connected");

  const existing = await Habit.countDocuments({ active: true });
  if (existing > 0) {
    console.log(`ℹ️  ${existing} habits already exist — skipping seed`);
  } else {
    await Habit.insertMany(HABITS);
    console.log(`🌱 Seeded ${HABITS.length} default habits`);
  }

  await mongoose.disconnect();
  console.log("🔌 Disconnected. Done!");
}

seed().catch(e => { console.error(e); process.exit(1); });
