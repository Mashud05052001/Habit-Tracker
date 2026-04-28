"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Habit, Log } from "@/types";
import styles from "./HabitTracker.module.css";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DEFAULT_SEEDS = [
  { name: "Wake up at 05:00", icon: "⏰" },
  { name: "Gym",              icon: "💪" },
  { name: "Reading / Learning", icon: "📚" },
  { name: "Budget Tracking",  icon: "💰" },
  { name: "Project Work",     icon: "🎯" },
  { name: "No Alcohol",       icon: "🍃" },
  { name: "Social Media Detox", icon: "🌿" },
  { name: "Goal Journaling",  icon: "📝" },
  { name: "Cold Shower",      icon: "🚿" },
];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

// ── Toast hook ───────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: "", visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (msg: string) => {
    clearTimeout(timerRef.current);
    setToast({ msg, visible: true });
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  };

  return { toast, showToast };
}

// ── API helpers ──────────────────────────────────────────────────────────
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
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
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

export default function HabitTracker() {
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [habits, setHabits]       = useState<Habit[]>([]);
  const [logs,   setLogs]         = useState<Log[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState<string>("");   // "habitId-day" being toggled
  const [newName, setNewName]     = useState("");
  const [newIcon, setNewIcon]     = useState("");
  const [seeding, setSeeding]     = useState(false);
  const [pinTaskColumn, setPinTaskColumn] = useState(true);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived state ────────────────────────────────────────────────────
  const days = daysInMonth(viewYear, viewMonth);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = now.getDate();

  function isDone(habitId: string, day: number) {
    return logs.some(l => l.habitId === habitId && l.day === day && l.done);
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
    const existing = logs.find(l => l.habitId === habitId && l.day === day);
    if (existing) {
      setLogs(prev => prev.map(l => l._id === existing._id ? { ...l, done: !l.done } : l));
    } else {
      setLogs(prev => [...prev, {
        _id: "tmp-" + key, habitId, year: viewYear,
        month: viewMonth, day, done: true,
      }]);
    }

    try {
      const { log } = await apiFetch("/api/logs", {
        method: "POST",
        body: JSON.stringify({ habitId, year: viewYear, month: viewMonth, day }),
      });
      // Replace optimistic with real
      setLogs(prev => {
        const filtered = prev.filter(l => l._id !== "tmp-" + key && l._id !== existing?._id);
        return [...filtered, log];
      });
    } catch (e) {
      // Revert
      setLogs(prev => {
        if (existing) return prev.map(l => l._id === existing._id ? existing : l);
        return prev.filter(l => l._id !== "tmp-" + key);
      });
      showToast(e instanceof Error ? `❌ ${e.message}` : "❌ Failed to save");
    } finally {
      setToggling("");
    }
  }

  // ── Add habit ─────────────────────────────────────────────────────────
  async function addHabit() {
    const name = newName.trim();
    if (!name) return showToast("Please enter a habit name");
    if (habits.length >= 20) return showToast("Max 20 habits");

    try {
      const { habit } = await apiFetch("/api/habits", {
        method: "POST",
        body: JSON.stringify({ name, icon: newIcon.trim() || "✅" }),
      });
      setHabits(prev => [...prev, habit]);
      setNewName(""); setNewIcon("");
      showToast(`✅ "${name}" added!`);
    } catch {
      showToast("❌ Failed to add habit");
    }
  }

  // ── Remove habit ──────────────────────────────────────────────────────
  async function removeHabit(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This will delete all its logs.`)) return;
    try {
      await apiFetch(`/api/habits/${id}`, { method: "DELETE" });
      setHabits(prev => prev.filter(h => h._id !== id));
      setLogs(prev => prev.filter(l => l.habitId !== id));
      showToast(`🗑 "${name}" removed`);
    } catch {
      showToast("❌ Failed to remove habit");
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
        setHabits(prev => [...prev, habit]);
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
    if (m > 11) { m = 0; y++; }
    if (m < 0)  { m = 11; y--; }
    setViewMonth(m); setViewYear(y);
  }

  // ── Analytics ─────────────────────────────────────────────────────────
  const doneLogs = logs.filter(l => l.done);

  function totalDoneMonth() { return doneLogs.length; }
  function overallPct() {
    const possible = habits.length * days;
    return possible ? Math.round(totalDoneMonth() / possible * 100) : 0;
  }
  function perfectDays() {
    let count = 0;
    for (let d = 1; d <= days; d++) {
      if (habits.every(h => isDone(h._id, d))) count++;
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
    const cnt = habits.filter(h => isDone(h._id, day)).length;
    return cnt / habits.length;
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🎮</div>
          <h1 className={styles.logoText}>Habit<span>Quest</span></h1>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statPill}><div className={styles.dot} />{habits.length} habits</div>
          <div className={styles.statPill}><div className={styles.dot} />{totalDoneMonth()} done this month</div>
        </div>
      </header>

      {/* MONTH NAV */}
      <div className={styles.monthNav}>
        <div className={styles.monthLeft}>
          <button className={styles.monthBtn} onClick={() => changeMonth(-1)}>‹</button>
          <h2 className={styles.monthTitle}>
            {MONTHS[viewMonth]} <span>{viewYear}</span>
          </h2>
          <button className={styles.monthBtn} onClick={() => changeMonth(1)}>›</button>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.overallLabel}>Monthly</span>
          <div className={styles.overallBar}>
            <div className={styles.overallFill} style={{ width: `${overallPct()}%` }} />
          </div>
          <span className={styles.overallPct}>{overallPct()}%</span>
        </div>
      </div>

      {/* ANALYSIS CARDS */}
      <div className={styles.analysisGrid}>
        {[
          { icon: "🏆", value: `${overallPct()}%`,       label: "Monthly Progress" },
          { icon: "🔥", value: totalDoneMonth(),          label: "Habits Completed" },
          { icon: "⭐", value: perfectDays(),             label: "Perfect Days" },
          { icon: "📅", value: isCurrentMonth ? now.getDate() : days, label: "Days Tracked" },
          { icon: "🎯", value: habits.length,             label: "Total Habits" },
          { icon: "📈", value: `${Math.round(overallPct() / 10)}/10`, label: "Consistency Score" },
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
          onClick={() => setPinTaskColumn(prev => !prev)}
        >
          {pinTaskColumn ? "Pinned Left" : "Scroll With Grid"}
        </button>
      </div>
      <div className={styles.gridScroll}>
        {loading ? (
          <div className={styles.loader}>
            <div className={styles.spinner} />
            <span>Loading from MongoDB…</span>
          </div>
        ) : habits.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🌱</div>
            <p>No habits yet. Add some below or load defaults.</p>
            <button className={styles.seedBtn} onClick={seedDefaults} disabled={seeding}>
              {seeding ? "Loading…" : "🚀 Load Default Habits"}
            </button>
          </div>
        ) : (
          <div className={styles.innerGrid} style={{ gridTemplateColumns: `220px repeat(${days}, minmax(28px,1fr))` }}>
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
            {Array.from({ length: days }, (_, i) => i + 1).map(d => (
              <div key={d} className={`${styles.ghLabel} ${isCurrentMonth && d === now.getDate() ? styles.todayLabel : ""}`}>
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
                >
                  <span className={styles.habitIcon}>{h.icon}</span>
                  <span className={styles.habitLabel}>{h.name}</span>
                </div>
                {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                  const done    = isDone(h._id, d);
                  const isToday  = isCurrentMonth && d === todayDay;
                  const isLocked = !canToggleDay(d);
                  const tKey     = `${h._id}-${d}`;
                  return (
                    <div
                      key={`cell-${h._id}-${d}`}
                      className={[
                        styles.dayCell,
                        done    ? styles.done    : "",
                        isLocked ? styles.locked : "",
                        isToday ? styles.today   : "",
                        toggling === tKey ? styles.toggling : "",
                      ].join(" ")}
                      onClick={() => canToggleDay(d) && toggle(h._id, d)}
                      title={canToggleDay(d) ? `${h.name} - mark today` : `${h.name} - only today's box can be marked`}
                    />
                  );
                })}
              </div>
            ))}

            {/* Summary row */}
            <div className={`${styles.sumLabel} ${pinTaskColumn ? styles.stickyFirstCol : ""}`}>Daily %</div>
            {Array.from({ length: days }, (_, i) => i + 1).map(d => {
              const pct = dayPct(d);
              const col = pct >= 0.8 ? "#22c55e" : pct >= 0.5 ? "#f59e0b" : pct > 0 ? "#6b8c7a" : "transparent";
              return (
                <div
                  key={`sum-${d}`}
                  className={styles.sumCell}
                  style={{ background: `${col}22`, border: `1px solid ${col}40`, color: pct > 0 ? "var(--green)" : "var(--muted)" }}
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
          <div className={styles.sectionTitle} style={{ marginTop: 28 }}>Current Streaks</div>
          <div className={styles.streaksRow}>
            {habits.map(h => {
              const streak = currentStreak(h._id);
              const pct = Math.min(streak / 30, 1);
              return (
                <div key={h._id} className={styles.streakCard}>
                  <div className={styles.streakName}>{h.icon} {h.name}</div>
                  <div className={styles.streakValue}>{streak}<span className={styles.streakUnit}> day streak</span></div>
                  <div className={styles.streakBar}><div className={styles.streakFill} style={{ width: `${pct * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CHART */}
      <div className={styles.chartSection}>
        <div className={styles.chartTitle}>Daily Completion Rate — {MONTHS[viewMonth]} {viewYear}</div>
        <div className={styles.chartCanvas}>
          <svg viewBox="0 0 1000 120" preserveAspectRatio="none" width="100%" height="100%">
            {(() => {
              const pts = Array.from({ length: days }, (_, i) => dayPct(i + 1));
              const W = 1000, H = 120, PAD = 10;
              const xStep = (W - PAD * 2) / Math.max(days - 1, 1);
              const points = pts.map((v, i) => [PAD + i * xStep, PAD + (1 - v) * (H - PAD * 2)]);
              const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
              const areaD = pathD + ` L${points[points.length - 1][0]},${H} L${PAD},${H} Z`;
              return (
                <>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d={areaD} fill="url(#cg)" />
                  <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((p, i) => pts[i] > 0 && (
                    <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#22c55e" opacity={0.8} />
                  ))}
                </>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* MANAGE HABITS */}
      <div className={styles.manageSection}>
        <div className={styles.manageTitle}>Manage Habits</div>
        <div className={styles.habitChips}>
          {habits.map(h => (
            <div key={h._id} className={styles.habitChip}>
              <span>{h.icon}</span>
              <span>{h.name}</span>
              <button className={styles.chipRemove} onClick={() => removeHabit(h._id, h.name)}>×</button>
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
            onChange={e => setNewIcon(e.target.value)}
            placeholder="🎯"
            maxLength={2}
          />
          <input
            className={styles.addInput}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Add a new habit…"
            maxLength={60}
            onKeyDown={e => e.key === "Enter" && addHabit()}
          />
          <button className={styles.addBtn} onClick={addHabit}>+ Add</button>
        </div>
        {habits.length === 0 && (
          <button className={styles.seedBtn} style={{ marginTop: 12 }} onClick={seedDefaults} disabled={seeding}>
            {seeding ? "Loading…" : "🚀 Load Default Habits"}
          </button>
        )}
      </div>

      {/* TOAST */}
      <div className={`${styles.toast} ${toast.visible ? styles.toastShow : ""}`}>
        {toast.msg}
      </div>
    </div>
  );
}
