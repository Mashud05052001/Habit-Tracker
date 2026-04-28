"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ClipLoader } from "react-spinners";
import type { Habit, Log, SessionUser } from "@/types";
import styles from "./HabitTracker.module.css";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./ThemeProvider";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DEFAULT_SEEDS = [
  { name: "Wake up at 05:00", icon: "⏰" },
  { name: "Gym", icon: "💪" },
  { name: "Reading / Learning", icon: "📚" },
  { name: "Budget Tracking", icon: "💰" },
  { name: "Project Work", icon: "🎯" },
  { name: "No Alcohol", icon: "🍃" },
  { name: "Social Media Detox", icon: "🌿" },
  { name: "Goal Journaling", icon: "📝" },
  { name: "Cold Shower", icon: "🚿" },
];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

// ── Toast hook ───────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({
    msg: "",
    visible: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (msg: string) => {
    clearTimeout(timerRef.current);
    setToast({ msg, visible: true });
    timerRef.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      2500,
    );
  };

  return { toast, showToast };
}

// ── API helpers ──────────────────────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

class ApiRequestError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.data = data;
  }
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        return false;
      }

      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function apiFetch(url: string, opts?: RequestInit, allowRetry = true) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  const text = await res.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    if (res.status === 401 && allowRetry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch(url, opts, false);
      }

      if (typeof window !== "undefined") {
        window.location.assign("/login?expired=1");
      }
    }

    throw new ApiRequestError(data?.error || "Request failed", res.status, data);
  }

  return data;
}

function sortHabitsByOrder(list: Habit[]) {
  return [...list].sort(
    (a, b) =>
      a.order - b.order ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

type DeletedHabitDuplicate = {
  habit: Habit;
  logCount: number;
  name: string;
  icon: string;
};

export default function HabitTracker({
  currentUser,
}: {
  currentUser: SessionUser;
}) {
  const now = new Date();
  const router = useRouter();
  const { isDark } = useTheme();
  const loaderColor = isDark ? "#ffffff" : "#000000";
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string>(""); // "habitId-day" being toggled
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [addingHabit, setAddingHabit] = useState(false);
  const [deletedDuplicate, setDeletedDuplicate] =
    useState<DeletedHabitDuplicate | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<
    "" | "restore" | "create"
  >("");
  const [seeding, setSeeding] = useState(false);
  const [pinTaskColumn, setPinTaskColumn] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState("");
  const [editingHabitName, setEditingHabitName] = useState("");
  const [renamingHabitId, setRenamingHabitId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [removingHabitId, setRemovingHabitId] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveHabits, setArchiveHabits] = useState<Habit[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [archiveActionId, setArchiveActionId] = useState("");
  const [hoveredDailyDay, setHoveredDailyDay] = useState<number | null>(null);

  const { toast, showToast } = useToast();

  // ── Fetch habits + logs ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ habits: h }, { logs: l }] = await Promise.all([
        apiFetch("/api/habits"),
        apiFetch(`/api/logs?year=${viewYear}&month=${viewMonth}`),
      ]);
      setHabits(h);
      setLogs(l);
    } catch (e) {
      showToast("❌ Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]); // eslint-disable-line

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!deleteTarget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !removingHabitId) {
        setDeleteTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget, removingHabitId]);

  useEffect(() => {
    if (!archiveOpen && !restoreTarget && !permanentDeleteTarget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || archiveActionId) return;

      if (restoreTarget) {
        setRestoreTarget(null);
        return;
      }

      if (permanentDeleteTarget) {
        setPermanentDeleteTarget(null);
        return;
      }

      setArchiveOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [archiveOpen, restoreTarget, permanentDeleteTarget, archiveActionId]);

  useEffect(() => {
    if (!deletedDuplicate) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !duplicateAction) {
        setDeletedDuplicate(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletedDuplicate, duplicateAction]);

  // ── Derived state ────────────────────────────────────────────────────
  const days = daysInMonth(viewYear, viewMonth);
  const isCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = now.getDate();

  function isDone(habitId: string, day: number) {
    return logs.some((l) => l.habitId === habitId && l.day === day && l.done);
  }

  function canToggleDay(day: number) {
    return isCurrentMonth && day === todayDay;
  }

  // ── Toggle a day ─────────────────────────────────────────────────────
  async function toggle(habitId: string, day: number) {
    if (!canToggleDay(day)) {
      showToast("Only today's box can be marked");
      return;
    }

    const key = `${habitId}-${day}`;
    if (toggling === key) return;
    setToggling(key);

    // Optimistic update
    const existing = logs.find((l) => l.habitId === habitId && l.day === day);
    if (existing) {
      setLogs((prev) =>
        prev.map((l) => (l._id === existing._id ? { ...l, done: !l.done } : l)),
      );
    } else {
      setLogs((prev) => [
        ...prev,
        {
          _id: "tmp-" + key,
          habitId,
          year: viewYear,
          month: viewMonth,
          day,
          done: true,
        },
      ]);
    }

    try {
      const { log } = await apiFetch("/api/logs", {
        method: "POST",
        body: JSON.stringify({
          habitId,
          year: viewYear,
          month: viewMonth,
          day,
        }),
      });
      // Replace optimistic with real
      setLogs((prev) => {
        const filtered = prev.filter(
          (l) => l._id !== "tmp-" + key && l._id !== existing?._id,
        );
        return [...filtered, log];
      });
    } catch (e) {
      // Revert
      setLogs((prev) => {
        if (existing)
          return prev.map((l) => (l._id === existing._id ? existing : l));
        return prev.filter((l) => l._id !== "tmp-" + key);
      });
      showToast(e instanceof Error ? `❌ ${e.message}` : "❌ Failed to save");
    } finally {
      setToggling("");
    }
  }

  // ── Add habit ─────────────────────────────────────────────────────────
  async function createHabitRequest(name: string, icon: string, createNew = false) {
    return apiFetch("/api/habits", {
      method: "POST",
      body: JSON.stringify({ name, icon, createNew }),
    });
  }

  async function addHabit() {
    const name = newName.trim();
    if (addingHabit) return;
    if (!name) return showToast("Please enter a habit name");
    if (habits.length >= 20) return showToast("Max 20 habits");

    const icon = newIcon.trim() || "✅";
    setAddingHabit(true);
    try {
      const { habit } = await createHabitRequest(name, icon);
      setHabits((prev) => [...prev, habit]);
      setNewName("");
      setNewIcon("");
      showToast(`✅ "${name}" added!`);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "deleted" &&
        error.data?.habit
      ) {
        setDeletedDuplicate({
          habit: error.data.habit,
          logCount: Number(error.data.logCount ?? 0),
          name,
          icon,
        });
        return;
      }

      showToast(
        error instanceof Error ? `❌ ${error.message}` : "❌ Failed to add habit",
      );
    } finally {
      setAddingHabit(false);
    }
  }

  function closeDeletedDuplicateDialog() {
    if (duplicateAction) return;
    setDeletedDuplicate(null);
  }

  async function restoreDeletedDuplicate() {
    if (!deletedDuplicate || duplicateAction) return;

    setDuplicateAction("restore");
    try {
      const { habit } = await apiFetch(
        `/api/habits/${deletedDuplicate.habit._id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        },
      );
      const { logs: refreshedLogs } = await apiFetch(
        `/api/logs?year=${viewYear}&month=${viewMonth}`,
      );

      setHabits((prev) =>
        sortHabitsByOrder(
          prev.some((h) => h._id === habit._id)
            ? prev.map((h) => (h._id === habit._id ? habit : h))
            : [...prev, habit],
        ),
      );
      setArchiveHabits((prev) =>
        prev.map((h) => (h._id === habit._id ? habit : h)),
      );
      setLogs(refreshedLogs);
      setNewName("");
      setNewIcon("");
      setDeletedDuplicate(null);
      showToast(`✅ "${habit.name}" restored`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to restore habit",
      );
    } finally {
      setDuplicateAction("");
    }
  }

  async function createNewDuplicateHabit() {
    if (!deletedDuplicate || duplicateAction) return;
    if (habits.length >= 20) return showToast("Max 20 habits");

    setDuplicateAction("create");
    try {
      const { habit } = await createHabitRequest(
        deletedDuplicate.name,
        deletedDuplicate.icon,
        true,
      );
      setHabits((prev) => [...prev, habit]);
      setNewName("");
      setNewIcon("");
      setDeletedDuplicate(null);
      showToast(`✅ "${habit.name}" added!`);
    } catch (error) {
      showToast(
        error instanceof Error ? `❌ ${error.message}` : "❌ Failed to add habit",
      );
    } finally {
      setDuplicateAction("");
    }
  }

  // ── Rename habit ─────────────────────────────────────────────────────
  function beginRenameHabit(habit: Habit) {
    if (renamingHabitId) return;
    setEditingHabitId(habit._id);
    setEditingHabitName(habit.name);
  }

  function cancelRenameHabit() {
    if (renamingHabitId) return;
    setEditingHabitId("");
    setEditingHabitName("");
  }

  async function saveEditedHabitName(id: string) {
    const habit = habits.find((h) => h._id === id);
    if (!habit || renamingHabitId) return;

    const name = editingHabitName.trim();
    if (!name) {
      setEditingHabitName(habit.name);
      showToast("Habit name cannot be empty");
      return;
    }

    if (name === habit.name) {
      cancelRenameHabit();
      return;
    }

    setRenamingHabitId(id);
    try {
      const { habit: updatedHabit } = await apiFetch(`/api/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setArchiveHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setEditingHabitId("");
      setEditingHabitName("");
      showToast(`✅ Renamed to "${updatedHabit.name}"`);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "active"
      ) {
        showToast("❌ That habit name already exists. Can't change name.");
        return;
      }

      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "deleted"
      ) {
        showToast(
          "❌ Can't change name. It already exists in Deleted Habits; restore it from there.",
        );
        return;
      }

      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to rename habit",
      );
    } finally {
      setRenamingHabitId("");
    }
  }

  // ── Remove habit ──────────────────────────────────────────────────────
  function requestRemoveHabit(id: string, name: string) {
    if (removingHabitId) return;
    setDeleteTarget({ id, name });
  }

  function closeDeleteDialog() {
    if (removingHabitId) return;
    setDeleteTarget(null);
  }

  async function removeHabit() {
    if (!deleteTarget || removingHabitId) return;

    const { id, name } = deleteTarget;
    setRemovingHabitId(id);
    try {
      const { habit } = await apiFetch(`/api/habits/${id}`, { method: "DELETE" });
      setHabits((prev) => prev.filter((h) => h._id !== id));
      setLogs((prev) => prev.filter((l) => l.habitId !== id));
      if (habit) {
        setArchiveHabits((prev) =>
          prev.some((h) => h._id === id)
            ? prev.map((h) => (h._id === id ? habit : h))
            : [...prev, habit],
        );
      }
      setDeleteTarget(null);
      showToast(`🗑 "${name}" removed`);
    } catch {
      showToast("❌ Failed to remove habit");
    } finally {
      setRemovingHabitId("");
    }
  }

  // ── Deleted habit archive ─────────────────────────────────────────────
  async function fetchHabitArchive() {
    setArchiveLoading(true);
    try {
      const { habits: allHabits } = await apiFetch("/api/habits?status=all");
      setArchiveHabits(allHabits);
    } catch {
      showToast("❌ Failed to load deleted habits");
    } finally {
      setArchiveLoading(false);
    }
  }

  function openHabitArchive() {
    setArchiveOpen(true);
    fetchHabitArchive();
  }

  function closeHabitArchive() {
    if (archiveActionId) return;
    setArchiveOpen(false);
    setRestoreTarget(null);
    setPermanentDeleteTarget(null);
  }

  function requestRestoreHabit(id: string, name: string) {
    if (archiveActionId) return;
    setRestoreTarget({ id, name });
  }

  function closeRestoreDialog() {
    if (archiveActionId) return;
    setRestoreTarget(null);
  }

  async function restoreHabit() {
    if (!restoreTarget || archiveActionId) return;

    const { id, name } = restoreTarget;
    setArchiveActionId(id);
    try {
      const { habit } = await apiFetch(`/api/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      });
      const { logs: refreshedLogs } = await apiFetch(
        `/api/logs?year=${viewYear}&month=${viewMonth}`,
      );

      setHabits((prev) =>
        sortHabitsByOrder(
          prev.some((h) => h._id === habit._id)
            ? prev.map((h) => (h._id === habit._id ? habit : h))
            : [...prev, habit],
        ),
      );
      setArchiveHabits((prev) =>
        prev.map((h) => (h._id === habit._id ? habit : h)),
      );
      setLogs(refreshedLogs);
      setRestoreTarget(null);
      showToast(`✅ "${name}" restored`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to restore habit",
      );
    } finally {
      setArchiveActionId("");
    }
  }

  function requestPermanentDeleteHabit(id: string, name: string) {
    if (archiveActionId) return;
    setPermanentDeleteTarget({ id, name });
  }

  function closePermanentDeleteDialog() {
    if (archiveActionId) return;
    setPermanentDeleteTarget(null);
  }

  async function permanentlyDeleteHabit() {
    if (!permanentDeleteTarget || archiveActionId) return;

    const { id, name } = permanentDeleteTarget;
    setArchiveActionId(id);
    try {
      await apiFetch(`/api/habits/${id}?permanent=true`, {
        method: "DELETE",
      });
      setArchiveHabits((prev) => prev.filter((h) => h._id !== id));
      setHabits((prev) => prev.filter((h) => h._id !== id));
      setLogs((prev) => prev.filter((l) => l.habitId !== id));
      setPermanentDeleteTarget(null);
      showToast(`🗑 "${name}" permanently deleted`);
    } catch {
      showToast("❌ Failed to permanently delete habit");
    } finally {
      setArchiveActionId("");
    }
  }

  // ── Seed default habits ───────────────────────────────────────────────
  async function seedDefaults() {
    setSeeding(true);
    try {
      for (const seed of DEFAULT_SEEDS) {
        const { habit } = await apiFetch("/api/habits", {
          method: "POST",
          body: JSON.stringify(seed),
        });
        setHabits((prev) => [...prev, habit]);
      }
      showToast("🌱 Default habits loaded!");
    } catch {
      showToast("❌ Failed to seed habits");
    } finally {
      setSeeding(false);
    }
  }

  // ── Month navigation ──────────────────────────────────────────────────
  function changeMonth(dir: number) {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m > 11) {
      m = 0;
      y++;
    }
    if (m < 0) {
      m = 11;
      y--;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  // ── Analytics ─────────────────────────────────────────────────────────
  const doneLogs = logs.filter((l) => l.done);

  function totalDoneMonth() {
    return doneLogs.length;
  }
  function overallPct() {
    const possible = habits.length * days;
    return possible ? Math.round((totalDoneMonth() / possible) * 100) : 0;
  }
  function perfectDays() {
    let count = 0;
    for (let d = 1; d <= days; d++) {
      if (habits.every((h) => isDone(h._id, d))) count++;
    }
    return count;
  }
  function currentStreak(habitId: string) {
    let streak = 0;
    const startDay = isCurrentMonth ? now.getDate() : days;
    for (let d = startDay; d >= 1; d--) {
      if (isDone(habitId, d)) streak++;
      else break;
    }
    return streak;
  }
  function dayPct(day: number) {
    if (!habits.length) return 0;
    const cnt = habits.filter((h) => isDone(h._id, day)).length;
    return cnt / habits.length;
  }

  function daySummaryStyle(pct: number) {
    if (pct >= 0.8) {
      return {
        background: "rgba(var(--success-rgb), 0.16)",
        border: "1px solid rgba(var(--success-rgb), 0.24)",
        color: "var(--success)",
      };
    }

    if (pct >= 0.5) {
      return {
        background: "rgba(var(--warning-rgb), 0.16)",
        border: "1px solid rgba(var(--warning-rgb), 0.24)",
        color: "var(--warning)",
      };
    }

    if (pct > 0) {
      return {
        background: "rgba(var(--accent-rgb), 0.14)",
        border: "1px solid rgba(var(--accent-rgb), 0.22)",
        color: "var(--accent)",
      };
    }

    return {
      background: "transparent",
      border: "1px solid transparent",
      color: "var(--muted)",
    };
  }

  const dailyCompletionSeries = Array.from({ length: days }, (_, i) =>
    dayPct(i + 1),
  );
  const averageDailyPct = dailyCompletionSeries.length
    ? Math.round(
        (dailyCompletionSeries.reduce((sum, value) => sum + value, 0) /
          dailyCompletionSeries.length) *
          100,
      )
    : 0;
  const bestDayPct = dailyCompletionSeries.length
    ? Math.round(Math.max(...dailyCompletionSeries) * 100)
    : 0;
  const habitPerformance = [...habits]
    .map((habit) => {
      const completed = doneLogs.filter(
        (log) => log.habitId === habit._id,
      ).length;
      const completionPct = days ? Math.round((completed / days) * 100) : 0;

      return {
        ...habit,
        completed,
        completionPct,
        streak: currentStreak(habit._id),
      };
    })
    .sort(
      (a, b) =>
        b.completionPct - a.completionPct ||
        b.completed - a.completed ||
        a.name.localeCompare(b.name),
    );
  const activeArchiveHabits = archiveHabits.filter((habit) => habit.active);
  const deletedArchiveHabits = archiveHabits.filter((habit) => !habit.active);

  const dailyChartGeometry = (() => {
    const W = 1000;
    const H = 150;
    const PAD_X = 14;
    const PAD_Y = 14;
    const xStep = (W - PAD_X * 2) / Math.max(days - 1, 1);
    const points = dailyCompletionSeries.map((value, index) => [
      PAD_X + index * xStep,
      PAD_Y + (1 - value) * (H - PAD_Y * 2),
    ]);
    const pathD = points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point[0].toFixed(1)},${point[1].toFixed(1)}`,
      )
      .join(" ");
    const areaD =
      points.length > 0
        ? pathD + ` L${points[points.length - 1][0]},${H} L${PAD_X},${H} Z`
        : "";

    return { areaD, pathD, points };
  })();
  const dailyYAxisTicks = [100, 80, 60, 40, 20];
  const hoveredDailyPoint =
    hoveredDailyDay && dailyChartGeometry.points[hoveredDailyDay - 1]
      ? {
          day: hoveredDailyDay,
          pct: Math.round(dailyCompletionSeries[hoveredDailyDay - 1] * 100),
          x: dailyChartGeometry.points[hoveredDailyDay - 1][0],
          y: dailyChartGeometry.points[hoveredDailyDay - 1][1],
        }
      : null;

  async function logout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <div className={styles.logoIcon}>H</div>
          <div className={styles.brandCopy}>
            <div className={styles.logoEyebrow}>Habitee Dashboard</div>
            <h1 className={styles.logoText}>Habitee</h1>
            <p className={styles.logoSubtext}>
              A beautiful daily workspace for habits, streaks, and steadier
              momentum.
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.headerStats}>
            <div className={styles.statPill}>
              <div className={styles.dot} />
              {habits.length} active habits
            </div>
            <div className={styles.statPill}>
              <div className={styles.dot} />
              {totalDoneMonth()} check-in's this month
            </div>
          </div>
          <div className={styles.headerActions}>
            <ThemeToggle />
            <div className={styles.userPanel}>
              <div className={styles.userText}>
                <div className={styles.userName}>{currentUser.name}</div>
                <div className={styles.userEmail}>{currentUser.email}</div>
              </div>
              <button
                type="button"
                className={styles.logoutBtn}
                onClick={logout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MONTH NAV */}
      <div className={styles.monthNav}>
        <div className={styles.monthLeft}>
          <button className={styles.monthBtn} onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <h2 className={styles.monthTitle}>
            {MONTHS[viewMonth]} <span>{viewYear}</span>
          </h2>
          <button className={styles.monthBtn} onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.overallLabel}>Month completion</span>
          <div className={styles.overallBar}>
            <div
              className={styles.overallFill}
              style={{ width: `${overallPct()}%` }}
            />
          </div>
          <span className={styles.overallPct}>{overallPct()}%</span>
        </div>
      </div>

      {/* ANALYSIS CARDS */}
      <div className={styles.analysisGrid}>
        {[
          { icon: "🏆", value: `${overallPct()}%`, label: "Monthly Progress" },
          { icon: "🔥", value: totalDoneMonth(), label: "Habits Completed" },
          { icon: "⭐", value: perfectDays(), label: "Perfect Days" },
          {
            icon: "📅",
            value: isCurrentMonth ? now.getDate() : days,
            label: "Days Tracked",
          },
          { icon: "🎯", value: habits.length, label: "Total Habits" },
          {
            icon: "📈",
            value: `${Math.round(overallPct() / 10)}/10`,
            label: "Consistency Score",
          },
        ].map((c, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardIcon}>{c.icon}</div>
            <div className={styles.cardValue}>{c.value}</div>
            <div className={styles.cardLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* HABIT GRID */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Daily Tracker</div>
        <button
          type="button"
          className={`${styles.pinToggle} ${pinTaskColumn ? styles.pinToggleActive : ""}`}
          aria-pressed={pinTaskColumn}
          onClick={() => setPinTaskColumn((prev) => !prev)}
        >
          {pinTaskColumn ? "Pinned Left" : "Scroll With Grid"}
        </button>
      </div>
      <div className={styles.gridScroll}>
        {loading ? (
          <div
            className={styles.loader}
            role="status"
            aria-label="Loading habits"
          >
            <ClipLoader size={34} color={loaderColor} loading />
          </div>
        ) : habits.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🌱</div>
            <p>
              No habits yet. Create your first one below or load the starter
              set.
            </p>
            <button
              className={styles.seedBtn}
              onClick={seedDefaults}
              disabled={seeding}
            >
              {seeding ? "Loading..." : "Load Starter Habits"}
            </button>
          </div>
        ) : (
          <div
            className={styles.innerGrid}
            style={{
              gridTemplateColumns: `220px repeat(${days}, minmax(28px,1fr))`,
            }}
          >
            {/* Header */}
            <div
              className={[
                styles.ghLabel,
                styles.habitHeaderCell,
                pinTaskColumn ? styles.stickyFirstCol : "",
              ].join(" ")}
            >
              Habit
            </div>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <div
                key={d}
                className={`${styles.ghLabel} ${isCurrentMonth && d === now.getDate() ? styles.todayLabel : ""}`}
              >
                {d}
              </div>
            ))}

            {/* Habit rows */}
            {habits.map((h, hi) => (
              <div key={h._id} className={styles.rowGroup}>
                <div
                  className={[
                    styles.habitName,
                    pinTaskColumn ? styles.stickyFirstCol : "",
                  ].join(" ")}
                  style={{ animationDelay: `${hi * 0.04}s` }}
                  onClick={(event) => {
                    if (event.detail === 3) {
                      beginRenameHabit(h);
                    }
                  }}
                >
                  <span className={styles.habitIcon}>{h.icon}</span>
                  {editingHabitId === h._id ? (
                    <div className={styles.habitRenameControl}>
                      <input
                        className={styles.habitRenameInput}
                        value={editingHabitName}
                        onChange={(event) =>
                          setEditingHabitName(event.target.value)
                        }
                        onBlur={() => {
                          void saveEditedHabitName(h._id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameHabit();
                          }
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                        maxLength={60}
                        disabled={renamingHabitId === h._id}
                        aria-label={`Rename ${h.name}`}
                        autoFocus
                      />
                      <button
                        type="button"
                        className={styles.habitRenameSave}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          void saveEditedHabitName(h._id);
                        }}
                        disabled={renamingHabitId === h._id}
                        aria-label={`Save ${h.name} name`}
                      >
                        ✔
                      </button>
                    </div>
                  ) : (
                    <span className={styles.habitLabel}>{h.name}</span>
                  )}
                </div>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const done = isDone(h._id, d);
                  const isToday = isCurrentMonth && d === todayDay;
                  const isLocked = !canToggleDay(d);
                  const tKey = `${h._id}-${d}`;
                  return (
                    <div
                      key={`cell-${h._id}-${d}`}
                      className={[
                        styles.dayCell,
                        done ? styles.done : "",
                        isLocked ? styles.locked : "",
                        isToday ? styles.today : "",
                        toggling === tKey ? styles.toggling : "",
                      ].join(" ")}
                      onClick={() => canToggleDay(d) && toggle(h._id, d)}
                      title={
                        canToggleDay(d)
                          ? `${h.name} - mark today`
                          : `${h.name} - only today's box can be marked`
                      }
                    />
                  );
                })}
              </div>
            ))}

            {/* Summary row */}
            <div
              className={`${styles.sumLabel} ${pinTaskColumn ? styles.stickyFirstCol : ""}`}
            >
              Daily %
            </div>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
              const pct = dayPct(d);
              return (
                <div
                  key={`sum-${d}`}
                  className={styles.sumCell}
                  style={daySummaryStyle(pct)}
                >
                  {pct > 0 ? `${Math.round(pct * 100)}%` : ""}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STREAKS */}
      {habits.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 28 }}>
            Current Streaks
          </div>
          <div className={styles.streaksRow}>
            {habits.map((h) => {
              const streak = currentStreak(h._id);
              const pct = Math.min(streak / 30, 1);
              return (
                <div key={h._id} className={styles.streakCard}>
                  <div className={styles.streakName}>
                    {h.icon} {h.name}
                  </div>
                  <div className={styles.streakValue}>
                    {streak}
                    <span className={styles.streakUnit}> day streak</span>
                  </div>
                  <div className={styles.streakBar}>
                    <div
                      className={styles.streakFill}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CHARTS */}
      {habits.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Insights</div>
          <div className={styles.chartGrid}>
            <div className={`${styles.chartSection} ${styles.dailyChartSection}`}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>
                  Daily Completion Rate — {MONTHS[viewMonth]} {viewYear}
                </div>
                <div className={styles.chartStats}>
                  <div className={styles.chartStat}>Avg {averageDailyPct}%</div>
                  <div className={styles.chartStat}>Best {bestDayPct}%</div>
                </div>
              </div>
              <div className={styles.chartPlot}>
                <div className={styles.chartPlotInner}>
                  <div className={styles.chartYAxis}>
                    {dailyYAxisTicks.map((tick) => (
                      <span key={tick} className={styles.chartYAxisLabel}>
                        {tick}
                      </span>
                    ))}
                  </div>

                  <div
                    className={styles.chartCanvas}
                    onMouseLeave={() => setHoveredDailyDay(null)}
                  >
                    {hoveredDailyPoint ? (
                      <div
                        className={styles.chartTooltip}
                        style={{
                          left: `${Math.min(
                            92,
                            Math.max(8, (hoveredDailyPoint.x / 1000) * 100),
                          )}%`,
                          top: `${Math.max(14, (hoveredDailyPoint.y / 150) * 100 - 6)}%`,
                        }}
                      >
                        <p>Day {hoveredDailyPoint.day}</p>
                        <p>Done {hoveredDailyPoint.pct}% </p>
                      </div>
                    ) : null}

                    <svg
                      viewBox="0 0 1000 150"
                      preserveAspectRatio="none"
                      width="100%"
                      height="100%"
                    >
                      <defs>
                        <linearGradient
                          id="daily-completion-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            style={{
                              stopColor: "rgb(var(--accent-rgb))",
                              stopOpacity: 0.34,
                            }}
                          />
                          <stop
                            offset="100%"
                            style={{
                              stopColor: "rgb(var(--accent-rgb))",
                              stopOpacity: 0.03,
                            }}
                          />
                        </linearGradient>
                      </defs>

                      {dailyYAxisTicks.map((tick) => {
                        const tickRatio = tick / 100;
                        const y = 14 + (1 - tickRatio) * (150 - 28);

                        return (
                          <line
                            key={tick}
                            x1="14"
                            x2="986"
                            y1={y}
                            y2={y}
                            className={styles.chartGridLine}
                          />
                        );
                      })}

                      <path
                        d={dailyChartGeometry.areaD}
                        fill="url(#daily-completion-fill)"
                      />
                      <path
                        d={dailyChartGeometry.pathD}
                        fill="none"
                        style={{ stroke: "rgb(var(--accent-rgb))" }}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {hoveredDailyPoint ? (
                        <>
                          <line
                            x1={hoveredDailyPoint.x}
                            x2={hoveredDailyPoint.x}
                            y1="14"
                            y2="136"
                            className={styles.chartHoverLine}
                          />
                          <circle
                            cx={hoveredDailyPoint.x}
                            cy={hoveredDailyPoint.y}
                            r={5}
                            className={styles.chartHoverPoint}
                          />
                        </>
                      ) : null}

                      {dailyChartGeometry.points.map((point, index) => {
                        const leftEdge =
                          index === 0
                            ? 14
                            : (dailyChartGeometry.points[index - 1][0] +
                                point[0]) /
                              2;
                        const rightEdge =
                          index === dailyChartGeometry.points.length - 1
                            ? 986
                            : (point[0] +
                                dailyChartGeometry.points[index + 1][0]) /
                              2;

                        return (
                          <rect
                            key={`hover-zone-${index + 1}`}
                            x={leftEdge}
                            y="14"
                            width={rightEdge - leftEdge}
                            height="122"
                            className={styles.chartHoverZone}
                            onMouseEnter={() => setHoveredDailyDay(index + 1)}
                          />
                        );
                      })}
                    </svg>
                  </div>

                  <div />
                  <div
                    className={styles.chartXAxis}
                    style={{
                      gridTemplateColumns: `repeat(${days}, minmax(18px, 1fr))`,
                    }}
                  >
                    {Array.from({ length: days }, (_, index) => index + 1).map(
                      (day) => (
                        <span
                          key={day}
                          className={`${styles.chartXAxisLabel} ${
                            hoveredDailyDay === day
                              ? styles.chartXAxisLabelActive
                              : ""
                          }`}
                          onMouseEnter={() => setHoveredDailyDay(day)}
                        >
                          {day}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>
                  Habit Success Rate — {MONTHS[viewMonth]} {viewYear}
                </div>
                <div className={styles.chartStats}>
                  <div className={styles.chartStat}>{habits.length} habits</div>
                  <div className={styles.chartStat}>
                    {totalDoneMonth()} done
                  </div>
                </div>
              </div>

              <div className={styles.habitBars}>
                {habitPerformance.map((habit) => (
                  <div key={habit._id} className={styles.habitBarRow}>
                    <div className={styles.habitBarHeader}>
                      <div className={styles.habitBarName}>
                        <span className={styles.habitBarIcon}>
                          {habit.icon}
                        </span>
                        <span className={styles.habitBarLabel}>
                          {habit.name}
                        </span>
                      </div>
                      <div className={styles.habitBarValue}>
                        {habit.completionPct}%
                      </div>
                    </div>
                    <div className={styles.habitBarTrack}>
                      <div
                        className={styles.habitBarFill}
                        style={{ width: `${habit.completionPct}%` }}
                      />
                    </div>
                    <div className={styles.habitBarMeta}>
                      <span>
                        {habit.completed}/{days} days
                      </span>
                      <span>{habit.streak} day streak</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* MANAGE HABITS */}
      <div className={styles.manageSection}>
        <div className={styles.manageTitle}>Manage Habits</div>
        <div className={styles.habitChips}>
          {habits.map((h) => (
            <div key={h._id} className={styles.habitChip}>
              <span>{h.icon}</span>
              <span>{h.name}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => requestRemoveHabit(h._id, h.name)}
                disabled={Boolean(removingHabitId)}
                aria-label={`Remove ${h.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {habits.length === 0 && (
            <span className={styles.noHabits}>No habits yet</span>
          )}
        </div>
        <div className={styles.addHabit}>
          <input
            className={styles.iconInput}
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="🎯"
            maxLength={2}
            disabled={addingHabit}
          />
          <input
            className={styles.addInput}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a new habit…"
            maxLength={60}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            disabled={addingHabit}
          />
          <button
            type="button"
            className={styles.addBtn}
            onClick={addHabit}
            disabled={addingHabit}
          >
            {addingHabit ? (
              <>
                <ClipLoader
                  size={14}
                  color={loaderColor}
                  loading
                  aria-label="Adding habit"
                />
                Adding...
              </>
            ) : (
              "+ Add"
            )}
          </button>
        </div>
        {habits.length === 0 && (
          <button
            className={styles.seedBtn}
            style={{ marginTop: 12 }}
            onClick={seedDefaults}
            disabled={seeding}
          >
            {seeding ? "Loading..." : "Load Starter Habits"}
          </button>
        )}
      </div>

      <div className={styles.archiveFooter}>
        <button
          type="button"
          className={styles.deletedHabitsBtn}
          onClick={openHabitArchive}
        >
          Deleted Habits
        </button>
      </div>

      {archiveOpen && (
        <div className={styles.modalBackdrop} onClick={closeHabitArchive}>
          <div
            className={styles.archiveModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="habit-archive-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.archiveHeader}>
              <div>
                <div className={styles.archiveEyebrow}>Habit archive</div>
                <h3 id="habit-archive-title" className={styles.archiveTitle}>
                  Deleted Habits
                </h3>
              </div>
              <button
                type="button"
                className={styles.archiveClose}
                onClick={closeHabitArchive}
                disabled={Boolean(archiveActionId)}
                aria-label="Close deleted habits"
              >
                ×
              </button>
            </div>

            {archiveLoading ? (
              <div className={styles.archiveLoader}>
                <ClipLoader
                  size={28}
                  color={loaderColor}
                  loading
                  aria-label="Loading deleted habits"
                />
              </div>
            ) : (
              <div className={styles.archiveBody}>
                <section className={styles.archiveGroup}>
                  <div className={styles.archiveGroupTitle}>
                    <span>Active Habits</span>
                    <span>{activeArchiveHabits.length}</span>
                  </div>
                  <div className={styles.archiveList}>
                    {activeArchiveHabits.length > 0 ? (
                      activeArchiveHabits.map((habit) => (
                        <div key={habit._id} className={styles.archiveItem}>
                          <div className={styles.archiveHabitName}>
                            <span className={styles.archiveIcon}>
                              {habit.icon}
                            </span>
                            <span>{habit.name}</span>
                          </div>
                          <span className={styles.archiveStatus}>Active</span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.archiveEmpty}>
                        No active habits
                      </div>
                    )}
                  </div>
                </section>

                <section className={styles.archiveGroup}>
                  <div className={styles.archiveGroupTitle}>
                    <span>Deleted Habits</span>
                    <span>{deletedArchiveHabits.length}</span>
                  </div>
                  <div className={styles.archiveList}>
                    {deletedArchiveHabits.length > 0 ? (
                      deletedArchiveHabits.map((habit) => (
                        <div
                          key={habit._id}
                          className={`${styles.archiveItem} ${styles.archiveItemDeleted}`}
                        >
                          <div className={styles.archiveHabitName}>
                            <span className={styles.archiveIcon}>
                              {habit.icon}
                            </span>
                            <span>{habit.name}</span>
                          </div>
                          <div className={styles.archiveActions}>
                            <button
                              type="button"
                              className={`${styles.archiveActionBtn} ${styles.archiveRestoreBtn}`}
                              onClick={() =>
                                requestRestoreHabit(habit._id, habit.name)
                              }
                              disabled={Boolean(archiveActionId)}
                            >
                              {archiveActionId === habit._id && restoreTarget
                                ? "Restoring..."
                                : "Restore"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.archiveActionBtn} ${styles.archivePermanentBtn}`}
                              onClick={() =>
                                requestPermanentDeleteHabit(
                                  habit._id,
                                  habit.name,
                                )
                              }
                              disabled={Boolean(archiveActionId)}
                            >
                              {archiveActionId === habit._id &&
                              permanentDeleteTarget
                                ? "Deleting..."
                                : "Permanently delete"}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.archiveEmpty}>
                        No deleted habits
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {deletedDuplicate && (
        <div
          className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}
          onClick={closeDeletedDuplicateDialog}
        >
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleted-duplicate-title"
            aria-describedby="deleted-duplicate-text"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmEyebrow}>Deleted match found</div>
            <h3 id="deleted-duplicate-title" className={styles.confirmTitle}>
              Restore "{deletedDuplicate.habit.name}"?
            </h3>
            <p id="deleted-duplicate-text" className={styles.confirmText}>
              You deleted a habit with this name before. It has about{" "}
              {deletedDuplicate.logCount} saved{" "}
              {deletedDuplicate.logCount === 1 ? "log" : "logs"}. Restore it
              or create a new habit with the same name?
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={closeDeletedDuplicateDialog}
                disabled={Boolean(duplicateAction)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={createNewDuplicateHabit}
                disabled={Boolean(duplicateAction)}
              >
                {duplicateAction === "create" ? (
                  <>
                    <ClipLoader
                      size={14}
                      color={loaderColor}
                      loading
                      aria-label="Creating new habit"
                    />
                    Creating...
                  </>
                ) : (
                  "Create new"
                )}
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnRestore}`}
                onClick={restoreDeletedDuplicate}
                disabled={Boolean(duplicateAction)}
              >
                {duplicateAction === "restore" ? (
                  <>
                    <ClipLoader
                      size={14}
                      color={loaderColor}
                      loading
                      aria-label="Restoring habit"
                    />
                    Restoring...
                  </>
                ) : (
                  "Restore previous"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalBackdrop} onClick={closeDeleteDialog}>
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-habit-title"
            aria-describedby="delete-habit-text"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmEyebrow}>Delete habit</div>
            <h3 id="delete-habit-title" className={styles.confirmTitle}>
              Remove "{deleteTarget.name}"?
            </h3>
            <p id="delete-habit-text" className={styles.confirmText}>
              This will move the habit to Deleted Habits. Its saved logs stay
              available if you restore it.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={closeDeleteDialog}
                disabled={Boolean(removingHabitId)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnDanger}`}
                onClick={removeHabit}
                disabled={Boolean(removingHabitId)}
              >
                {removingHabitId === deleteTarget.id ? (
                  <>
                    <ClipLoader
                      size={14}
                      color={loaderColor}
                      loading
                      aria-label="Deleting habit"
                    />
                    Deleting...
                  </>
                ) : (
                  "Move to Deleted"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreTarget && (
        <div
          className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}
          onClick={closeRestoreDialog}
        >
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-habit-title"
            aria-describedby="restore-habit-text"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmEyebrow}>Restore habit</div>
            <h3 id="restore-habit-title" className={styles.confirmTitle}>
              Restore "{restoreTarget.name}"?
            </h3>
            <p id="restore-habit-text" className={styles.confirmText}>
              This habit will return to your active homepage tracker.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={closeRestoreDialog}
                disabled={Boolean(archiveActionId)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnRestore}`}
                onClick={restoreHabit}
                disabled={Boolean(archiveActionId)}
              >
                {archiveActionId === restoreTarget.id ? (
                  <>
                    <ClipLoader
                      size={14}
                      color={loaderColor}
                      loading
                      aria-label="Restoring habit"
                    />
                    Restoring...
                  </>
                ) : (
                  "Yes, restore"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {permanentDeleteTarget && (
        <div
          className={`${styles.modalBackdrop} ${styles.confirmBackdrop}`}
          onClick={closePermanentDeleteDialog}
        >
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="permanent-delete-habit-title"
            aria-describedby="permanent-delete-habit-text"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmEyebrow}>Permanently delete</div>
            <h3
              id="permanent-delete-habit-title"
              className={styles.confirmTitle}
            >
              Delete "{permanentDeleteTarget.name}" forever?
            </h3>
            <p id="permanent-delete-habit-text" className={styles.confirmText}>
              This will permanently delete the habit and all of its saved logs
              from the database.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={closePermanentDeleteDialog}
                disabled={Boolean(archiveActionId)}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnDanger}`}
                onClick={permanentlyDeleteHabit}
                disabled={Boolean(archiveActionId)}
              >
                {archiveActionId === permanentDeleteTarget.id ? (
                  <>
                    <ClipLoader
                      size={14}
                      color={loaderColor}
                      loading
                      aria-label="Permanently deleting habit"
                    />
                    Deleting...
                  </>
                ) : (
                  "Delete forever"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div
        className={`${styles.toast} ${toast.visible ? styles.toastShow : ""}`}
      >
        {toast.msg}
      </div>
    </div>
  );
}
