"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ClipLoader } from "react-spinners";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Habit, Log, SessionUser } from "@/types";
import styles from "./HabitTracker.module.css";
import { useTheme } from "./ThemeProvider";
import ThemeToggle from "./ThemeToggle";
import {
  getNotificationPermissionState,
  playNotificationSound,
  sendWebPushNotification,
  showComprehensiveNotification,
  subscribeToPushNotifications,
} from "@/lib/notificationUtils";
import type { NotificationPermissionState } from "@/lib/notificationUtils";

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

const HABIT_NAME_MIN_LENGTH = 3;
const HABIT_NAME_MAX_LENGTH = 25;
const DEFAULT_NOTIFICATION_TIME = "20:00";
const NOTIFICATION_STORAGE_PREFIX = "habitee.dailyNotification.";
const NOTIFICATION_SW_PATH = "/habitee-notification-sw.js";
const REMINDER_CHECK_INTERVAL_MS = 5_000;
const HABIT_DND_TYPE = "habit-row";
const LOG_EDIT_WINDOW_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_AUTH_REFRESH_DELAY_MS = 5_000;
const MAX_AUTH_REFRESH_DELAY_MS = 5 * 60 * 1000;

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function parseDurationToMs(value: string) {
  const match = value.trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return 15 * 60 * 1000;

  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

function getAuthRefreshDelayMs(accessTokenExpiresIn: string) {
  const expiresMs = parseDurationToMs(accessTokenExpiresIn);
  const refreshMs = Math.floor(expiresMs * 0.8);

  return Math.min(
    Math.max(refreshMs, MIN_AUTH_REFRESH_DELAY_MS),
    MAX_AUTH_REFRESH_DELAY_MS,
  );
}

function getCalendarDayNumber(year: number, month: number, day: number) {
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / MS_PER_DAY);
}

function isValidReminderTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function notificationStorageKey(userId: string) {
  return `${NOTIFICATION_STORAGE_PREFIX}${userId}`;
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getNextReminderDate(time: string, from = new Date()) {
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(from);
  target.setHours(hours, minutes, 0, 0);

  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function isReminderDue(time: string, date = new Date()) {
  if (!isValidReminderTime(time)) {
    return false;
  }

  const [hours, minutes] = time.split(":").map(Number);

  return date.getHours() === hours && date.getMinutes() === minutes;
}

function formatReminderTime(time: string) {
  if (!isValidReminderTime(time)) {
    return "Choose a time";
  }

  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatNextReminderDate(time: string) {
  if (!isValidReminderTime(time)) {
    return "Choose a valid time";
  }

  const now = new Date();
  const nextReminder = getNextReminderDate(time, now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayLabel =
    getDateKey(nextReminder) === getDateKey(now)
      ? "Today"
      : getDateKey(nextReminder) === getDateKey(tomorrow)
        ? "Tomorrow"
        : new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(nextReminder);

  return `${dayLabel} at ${formatReminderTime(time)}`;
}

// ── Toast hook ───────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{
    loading: boolean;
    msg: string;
    visible: boolean;
  }>({
    loading: false,
    msg: "",
    visible: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (
    msg: string,
    options: { duration?: number | null; loading?: boolean } = {},
  ) => {
    clearTimeout(timerRef.current);
    setToast({ loading: options.loading === true, msg, visible: true });

    const duration = options.duration ?? 2500;
    if (duration !== null) {
      timerRef.current = setTimeout(
        () => setToast((t) => ({ ...t, visible: false })),
        duration,
      );
    }
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
        credentials: "include",
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
    credentials: opts?.credentials ?? "include",
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

    throw new ApiRequestError(
      data?.error || "Request failed",
      res.status,
      data,
    );
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

function assignHabitOrders(list: Habit[]) {
  return list.map((habit, order) =>
    habit.order === order ? habit : { ...habit, order },
  );
}

function getHabitNameError(name: string) {
  if (!name) {
    return "Please enter a habit name";
  }

  if (
    name.length < HABIT_NAME_MIN_LENGTH ||
    name.length > HABIT_NAME_MAX_LENGTH
  ) {
    return `Habit name must be ${HABIT_NAME_MIN_LENGTH}-${HABIT_NAME_MAX_LENGTH} characters`;
  }

  return "";
}

type DeletedHabitDuplicate = {
  habit: Habit;
  logCount: number;
  name: string;
  icon: string;
};

type DragHabitItem = {
  id: string;
  index: number;
};

type HabitNameCellProps = {
  habit: Habit;
  index: number;
  animationDelay: string;
  children: ReactNode;
  dragDisabled: boolean;
  isDraggingHabit: boolean;
  onBeginRename: (habit: Habit) => void;
  onDragEnd: () => void;
  onDragStart: (habitId: string) => void;
  onMoveHabit: (dragIndex: number, hoverIndex: number) => void;
};

function HabitNameCell({
  habit,
  index,
  animationDelay,
  children,
  dragDisabled,
  isDraggingHabit,
  onBeginRename,
  onDragEnd,
  onDragStart,
  onMoveHabit,
}: HabitNameCellProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLSpanElement | null>(null);

  const [{ handlerId }, drop] = useDrop<
    DragHabitItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: HABIT_DND_TYPE,
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
    hover(item, monitor) {
      if (!rowRef.current || item.id === habit._id) return;

      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverRect = rowRef.current.getBoundingClientRect();
      const hoverMiddleY = (hoverRect.bottom - hoverRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const hoverClientY = clientOffset.y - hoverRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      onMoveHabit(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: HABIT_DND_TYPE,
    canDrag: () => !dragDisabled,
    item: () => {
      onDragStart(habit._id);
      return { id: habit._id, index };
    },
    end: () => {
      onDragEnd();
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drop(rowRef);
  preview(rowRef);
  drag(handleRef);

  return (
    <div
      ref={rowRef}
      className={[
        styles.habitName,
        isDragging ? styles.habitNameDragging : "",
        isDraggingHabit ? styles.habitNameDragActive : "",
      ].join(" ")}
      data-handler-id={handlerId ? String(handlerId) : undefined}
      style={{ animationDelay }}
      onClick={(event) => {
        if (event.detail === 3) {
          onBeginRename(habit);
        }
      }}
    >
      <span
        ref={handleRef}
        className={[
          styles.habitIcon,
          styles.habitDragHandle,
          dragDisabled ? styles.habitDragHandleDisabled : "",
        ].join(" ")}
        title={dragDisabled ? undefined : "Drag to reorder"}
        aria-label={`Drag ${habit.name} to reorder`}
      >
        {habit.icon}
      </span>
      {children}
    </div>
  );
}

export default function HabitTracker({
  currentUser,
  accessTokenExpiresIn,
}: {
  currentUser: SessionUser;
  accessTokenExpiresIn: string;
}) {
  const now = new Date();
  const router = useRouter();
  const { isDark } = useTheme();
  const loaderColor = isDark ? "#ffffff" : "#000000";
  const userInitial =
    currentUser.name.trim().charAt(0).toUpperCase() ||
    currentUser.email.trim().charAt(0).toUpperCase() ||
    "U";
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
  const [renameHadDuplicateError, setRenameHadDuplicateError] = useState(false);
  const renameControlRef = useRef<HTMLDivElement | null>(null);
  const [editingHabitIconId, setEditingHabitIconId] = useState("");
  const [editingHabitIcon, setEditingHabitIcon] = useState("");
  const [updatingHabitIconId, setUpdatingHabitIconId] = useState("");
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
  const [draggingHabitId, setDraggingHabitId] = useState("");
  const [savingHabitOrder, setSavingHabitOrder] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationTime, setNotificationTime] = useState(
    DEFAULT_NOTIFICATION_TIME,
  );
  const [notificationHydrated, setNotificationHydrated] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("default");
  const [notificationLastSentDate, setNotificationLastSentDate] = useState("");
  const [autoMarkedToday, setAutoMarkedToday] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const notificationLastSentDateRef = useRef("");
  const habitOrderBeforeDragRef = useRef<Habit[] | null>(null);
  const latestHabitsRef = useRef<Habit[]>([]);

  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshDelay = getAuthRefreshDelayMs(accessTokenExpiresIn);

    const scheduleRefresh = () => {
      refreshTimer = setTimeout(async () => {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          window.location.assign("/login?expired=1");
          return;
        }

        if (!cancelled) {
          scheduleRefresh();
        }
      }, refreshDelay);
    };

    void refreshAccessToken().then((refreshed) => {
      if (cancelled) return;

      if (!refreshed) {
        window.location.assign("/login?expired=1");
        return;
      }

      scheduleRefresh();
    });

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [accessTokenExpiresIn]);

  useEffect(() => {
    latestHabitsRef.current = habits;
  }, [habits]);

  // ── Derived date + grid state ────────────────────────────────────────
  const days = daysInMonth(viewYear, viewMonth);
  const isCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = now.getDate();

  function getLogForDay(habitId: string, day: number) {
    return logs.find(
      (l) =>
        l.habitId === habitId &&
        l.day === day &&
        l.month === viewMonth &&
        l.year === viewYear,
    );
  }

  function isDone(habitId: string, day: number) {
    return getLogForDay(habitId, day)?.done === true;
  }

  function canToggleDay(day: number) {
    const targetDay = getCalendarDayNumber(viewYear, viewMonth, day);
    const currentDay = getCalendarDayNumber(
      now.getFullYear(),
      now.getMonth(),
      todayDay,
    );

    if (targetDay === null || currentDay === null) {
      return false;
    }

    const ageInDays = currentDay - targetDay;
    return ageInDays >= 0 && ageInDays < LOG_EDIT_WINDOW_DAYS;
  }

  function getHabitTrackingStartDay(habit: Habit) {
    const createdAt = new Date(habit.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return 1;
    }

    const createdYear = createdAt.getFullYear();
    const createdMonth = createdAt.getMonth();

    if (
      createdYear > viewYear ||
      (createdYear === viewYear && createdMonth > viewMonth)
    ) {
      return days + 1;
    }

    return createdYear === viewYear && createdMonth === viewMonth
      ? Math.min(Math.max(createdAt.getDate(), 1), days)
      : 1;
  }

  function habitExistsOnDay(habit: Habit, day: number) {
    return day >= getHabitTrackingStartDay(habit);
  }

  function getHabitGoalDays(habit: Habit) {
    return Math.max(days - getHabitTrackingStartDay(habit) + 1, 0);
  }

  function isPastDay(day: number) {
    if (viewYear < now.getFullYear()) return true;
    if (viewYear > now.getFullYear()) return false;
    if (viewMonth < now.getMonth()) return true;
    if (viewMonth > now.getMonth()) return false;
    return day < todayDay;
  }

  function isMissed(habit: Habit, day: number) {
    const log = getLogForDay(habit._id, day);
    if (log) {
      if (isCurrentMonth && day === todayDay && !autoMarkedToday) {
        return false;
      }

      return log.done === false;
    }

    return habitExistsOnDay(habit, day) && isPastDay(day);
  }

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
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      getNotificationPermissionState() === "unsupported" ||
      getNotificationPermissionState() === "insecure"
    ) {
      return;
    }

    navigator.serviceWorker.register(NOTIFICATION_SW_PATH).catch(() => {
      // The app falls back to the regular Notification constructor.
    });
  }, []);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
    };

    syncNotificationPermission();
    window.addEventListener("focus", syncNotificationPermission);
    document.addEventListener("visibilitychange", syncNotificationPermission);

    return () => {
      window.removeEventListener("focus", syncNotificationPermission);
      document.removeEventListener(
        "visibilitychange",
        syncNotificationPermission,
      );
    };
  }, []);

  useEffect(() => {
    setNotificationHydrated(false);

    let nextEnabled = false;
    let nextTime = DEFAULT_NOTIFICATION_TIME;
    let nextLastSentDate = "";

    try {
      const saved = window.localStorage.getItem(
        notificationStorageKey(currentUser.id),
      );

      if (saved) {
        const parsed = JSON.parse(saved) as {
          enabled?: unknown;
          time?: unknown;
          lastSentDate?: unknown;
        };

        nextEnabled = parsed.enabled === true;
        if (
          typeof parsed.time === "string" &&
          isValidReminderTime(parsed.time)
        ) {
          nextTime = parsed.time;
        }
        if (typeof parsed.lastSentDate === "string") {
          nextLastSentDate = parsed.lastSentDate;
        }
      }
    } catch {
      // Keep the default reminder settings if localStorage is unavailable.
    }

    setNotificationEnabled(nextEnabled);
    setNotificationTime(nextTime);
    setNotificationLastSentDate(nextLastSentDate);
    notificationLastSentDateRef.current = nextLastSentDate;
    setNotificationPermission(getNotificationPermissionState());
    setNotificationHydrated(true);
  }, [currentUser.id]);

  useEffect(() => {
    if (!notificationHydrated) return;

    try {
      window.localStorage.setItem(
        notificationStorageKey(currentUser.id),
        JSON.stringify({
          enabled: notificationEnabled,
          lastSentDate: notificationLastSentDate,
          time: notificationTime,
        }),
      );
    } catch {
      // The reminder still works for the current tab if persistence fails.
    }
  }, [
    currentUser.id,
    notificationEnabled,
    notificationHydrated,
    notificationLastSentDate,
    notificationTime,
  ]);

  useEffect(() => {
    notificationLastSentDateRef.current = notificationLastSentDate;
  }, [notificationLastSentDate]);

  useEffect(() => {
    if (notificationTimerRef.current) {
      clearInterval(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }

    if (
      !notificationHydrated ||
      !notificationEnabled ||
      !isValidReminderTime(notificationTime)
    ) {
      return;
    }

    const sendReminder = async () => {
      const title = "Daily activity check-in";
      const body = "Update today's habits and keep your progress current.";
      const tag = `habitee-daily-${currentUser.id}`;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

      const webPushResult = await sendWebPushNotification({
        body,
        publicKey,
        tag,
        title,
      });

      if (webPushResult.sent) {
        const soundPlayed = await playNotificationSound(0.6);
        showToastRef.current(
          soundPlayed
            ? "Windows notification sent with sound. Update today's habits."
            : "Windows notification sent. Update today's habits.",
        );
        return;
      }

      const { notificationShown, soundPlayed } =
        await showComprehensiveNotification({
          title,
          body,
          tag,
          playSound: true,
          volumeLevel: 0.6,
        });

      const toastMessage = notificationShown
        ? soundPlayed
          ? "Daily reminder sent locally with sound. Update today's habits."
          : "Daily reminder sent locally. Update today's habits."
        : webPushResult.error === "missing-vapid-public-key"
          ? "Daily reminder due, but VAPID keys are missing. Restart the dev server after adding env keys."
          : "Daily reminder due. Browser notifications are not allowed.";

      showToastRef.current(toastMessage);
    };

    const checkReminder = () => {
      const currentDate = new Date();
      const todayKey = getDateKey(currentDate);

      // Debug logging (remove later)
      const isDue = isReminderDue(notificationTime, currentDate);
      const alreadySent = notificationLastSentDateRef.current === todayKey;

      if (isDue && !alreadySent) {
        console.log(
          `[Reminder] Triggering at ${currentDate.toLocaleTimeString()} (${notificationTime})`,
        );
      }

      if (alreadySent || !isDue) {
        return;
      }

      notificationLastSentDateRef.current = todayKey;
      setNotificationLastSentDate(todayKey);
      void sendReminder();
    };

    checkReminder();
    notificationTimerRef.current = setInterval(
      checkReminder,
      REMINDER_CHECK_INTERVAL_MS,
    );

    const checkWhenActive = () => {
      if (!document.hidden) {
        checkReminder();
      }
    };

    window.addEventListener("focus", checkReminder);
    document.addEventListener("visibilitychange", checkWhenActive);

    return () => {
      if (notificationTimerRef.current) {
        clearInterval(notificationTimerRef.current);
        notificationTimerRef.current = null;
      }
      window.removeEventListener("focus", checkReminder);
      document.removeEventListener("visibilitychange", checkWhenActive);
    };
  }, [
    currentUser.id,
    notificationEnabled,
    notificationHydrated,
    notificationTime,
  ]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

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

  // ── Auto-mark incomplete habits at end of day ──────────────────────────
  useEffect(() => {
    if (!isCurrentMonth || habits.length === 0) return;

    const checkAndMarkIncomplete = async () => {
      const currentTime = new Date();
      const hours = currentTime.getHours();
      const minutes = currentTime.getMinutes();
      const seconds = currentTime.getSeconds();

      // Mark today's untouched habits only at the last second of the day.
      if (hours === 23 && minutes === 59 && seconds >= 59 && !autoMarkedToday) {
        setAutoMarkedToday(true);

        try {
          const incompleteHabits = habits.filter(
            (habit) => !getLogForDay(habit._id, todayDay),
          );

          if (incompleteHabits.length === 0) {
            return;
          }

          await Promise.all(
            incompleteHabits.map((habit) =>
              apiFetch("/api/logs", {
                method: "POST",
                body: JSON.stringify({
                  habitId: habit._id,
                  year: viewYear,
                  month: viewMonth,
                  day: todayDay,
                  done: false,
                }),
              }),
            ),
          );

          // Refresh logs after auto-marking
          const { logs: refreshedLogs } = await apiFetch(
            `/api/logs?year=${viewYear}&month=${viewMonth}`,
          );
          setLogs(refreshedLogs);
          showToastRef.current("Incomplete habits marked for today");
        } catch (error) {
          console.error("Failed to auto-mark incomplete habits:", error);
        }
      } else if (!(hours === 23 && minutes === 59)) {
        // Reset the flag when it's not 23:59
        setAutoMarkedToday(false);
      }
    };

    // Check every second so the current day stays open until 23:59:59.
    void checkAndMarkIncomplete();
    const timer = setInterval(checkAndMarkIncomplete, 1000);
    return () => clearInterval(timer);
  }, [
    autoMarkedToday,
    isCurrentMonth,
    habits,
    logs,
    todayDay,
    viewMonth,
    viewYear,
  ]);

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

  useEffect(() => {
    if (!editingHabitId || !renameHadDuplicateError) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (renamingHabitId) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (renameControlRef.current?.contains(target)) return;

      cancelRenameHabit();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [editingHabitId, renameHadDuplicateError, renamingHabitId]);

  // ── Toggle a day ─────────────────────────────────────────────────────
  async function toggle(habitId: string, day: number) {
    if (!canToggleDay(day)) {
      showToast("Only today or yesterday can be marked");
      return;
    }

    const key = `${habitId}-${day}`;
    if (toggling === key) return;
    setToggling(key);

    // Optimistic update
    const existing = getLogForDay(habitId, day);
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
          (l) =>
            l._id !== "tmp-" + key && (!existing || l._id !== existing._id),
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
  async function createHabitRequest(
    name: string,
    icon: string,
    createNew = false,
  ) {
    return apiFetch("/api/habits", {
      method: "POST",
      body: JSON.stringify({ name, icon, createNew }),
    });
  }

  async function addHabit() {
    const name = newName.trim();
    if (addingHabit) return;
    const nameError = getHabitNameError(name);
    if (nameError) return showToast(nameError);
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
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to add habit",
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
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to add habit",
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
    setRenameHadDuplicateError(false);
  }

  function cancelRenameHabit() {
    if (renamingHabitId) return;
    setEditingHabitId("");
    setEditingHabitName("");
    setRenameHadDuplicateError(false);
  }

  function beginEditHabitIcon(habit: Habit) {
    if (updatingHabitIconId) return;
    setEditingHabitIconId(habit._id);
    setEditingHabitIcon(habit.icon);
  }

  function cancelEditHabitIcon() {
    if (updatingHabitIconId) return;
    setEditingHabitIconId("");
    setEditingHabitIcon("");
  }

  function beginEditHabitDetails(habit: Habit) {
    if (renamingHabitId || updatingHabitIconId) return;
    setEditingHabitId(habit._id);
    setEditingHabitName(habit.name);
    setEditingHabitIconId(habit._id);
    setEditingHabitIcon(habit.icon);
    setRenameHadDuplicateError(false);
  }

  function cancelEditHabitDetails() {
    if (renamingHabitId || updatingHabitIconId) return;
    setEditingHabitId("");
    setEditingHabitName("");
    setRenameHadDuplicateError(false);
    setEditingHabitIconId("");
    setEditingHabitIcon("");
  }

  async function saveEditedHabitName(id: string) {
    const habit = habits.find((h) => h._id === id);
    if (!habit || renamingHabitId) return;

    const name = editingHabitName.trim();
    const nameError = getHabitNameError(name);
    if (nameError) {
      setEditingHabitName(habit.name);
      showToast(nameError);
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
      setRenameHadDuplicateError(false);
      showToast(`✅ Renamed to "${updatedHabit.name}"`);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "active"
      ) {
        setRenameHadDuplicateError(true);
        showToast("❌ That habit name already exists. Can't change name.");
        return;
      }

      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "deleted"
      ) {
        setRenameHadDuplicateError(true);
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

  async function saveEditedHabitIcon(id: string) {
    const habit = habits.find((h) => h._id === id);
    if (!habit || updatingHabitIconId) return;

    const icon = editingHabitIcon.trim() || "✅";
    if (icon === habit.icon) {
      cancelEditHabitIcon();
      return;
    }

    setUpdatingHabitIconId(id);
    try {
      const { habit: updatedHabit } = await apiFetch(`/api/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ icon }),
      });
      setHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setArchiveHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setEditingHabitIconId("");
      setEditingHabitIcon("");
      showToast(`✅ Updated "${updatedHabit.name}" icon`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to update habit icon",
      );
    } finally {
      setUpdatingHabitIconId("");
    }
  }

  async function saveEditedHabitDetails(id: string) {
    const habit = habits.find((h) => h._id === id);
    if (!habit || renamingHabitId || updatingHabitIconId) return;

    const name = editingHabitName.trim();
    const icon = editingHabitIcon.trim() || "✅";
    const nameError = getHabitNameError(name);
    if (nameError) {
      setEditingHabitName(habit.name);
      showToast(nameError);
      return;
    }

    if (name === habit.name && icon === habit.icon) {
      cancelEditHabitDetails();
      return;
    }

    setRenamingHabitId(id);
    setUpdatingHabitIconId(id);
    try {
      const { habit: updatedHabit } = await apiFetch(`/api/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ icon, name }),
      });
      setHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setArchiveHabits((prev) =>
        prev.map((h) => (h._id === updatedHabit._id ? updatedHabit : h)),
      );
      setEditingHabitId("");
      setEditingHabitName("");
      setRenameHadDuplicateError(false);
      setEditingHabitIconId("");
      setEditingHabitIcon("");
      showToast(`✅ Updated "${updatedHabit.name}"`);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "active"
      ) {
        setRenameHadDuplicateError(true);
        showToast("❌ That habit name already exists. Can't change name.");
        return;
      }

      if (
        error instanceof ApiRequestError &&
        error.data?.duplicateType === "deleted"
      ) {
        setRenameHadDuplicateError(true);
        showToast(
          "❌ Can't change name. It already exists in Deleted Habits; restore it from there.",
        );
        return;
      }

      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to update habit",
      );
    } finally {
      setRenamingHabitId("");
      setUpdatingHabitIconId("");
    }
  }

  function syncArchiveHabitOrders(orderedHabits: Habit[]) {
    const orderById = new Map(
      orderedHabits.map((habit) => [habit._id, habit.order]),
    );

    setArchiveHabits((prev) =>
      prev.map((habit) =>
        orderById.has(habit._id)
          ? { ...habit, order: orderById.get(habit._id)! }
          : habit,
      ),
    );
  }

  function startHabitDrag(habitId: string) {
    if (savingHabitOrder) return;
    habitOrderBeforeDragRef.current = latestHabitsRef.current;
    setDraggingHabitId(habitId);
  }

  function moveHabit(dragIndex: number, hoverIndex: number) {
    if (savingHabitOrder || dragIndex === hoverIndex) return;

    setHabits((prev) => {
      if (
        dragIndex < 0 ||
        hoverIndex < 0 ||
        dragIndex >= prev.length ||
        hoverIndex >= prev.length
      ) {
        return prev;
      }

      const next = [...prev];
      const [draggedHabit] = next.splice(dragIndex, 1);
      if (!draggedHabit) return prev;

      next.splice(hoverIndex, 0, draggedHabit);
      const ordered = assignHabitOrders(next);
      latestHabitsRef.current = ordered;
      return ordered;
    });
  }

  async function finishHabitDrag() {
    const originalHabits = habitOrderBeforeDragRef.current;
    const orderedHabits = assignHabitOrders(latestHabitsRef.current);

    habitOrderBeforeDragRef.current = null;
    setDraggingHabitId("");

    if (!originalHabits) return;

    const orderChanged =
      originalHabits.length !== orderedHabits.length ||
      originalHabits.some((habit, index) => habit._id !== orderedHabits[index]?._id);

    if (!orderChanged) return;

    const originalOrderById = new Map(
      originalHabits.map((habit) => [habit._id, habit.order]),
    );
    const changedHabits = orderedHabits.filter(
      (habit) => originalOrderById.get(habit._id) !== habit.order,
    );

    setSavingHabitOrder(true);
    setHabits(orderedHabits);
    syncArchiveHabitOrders(orderedHabits);
    showToast("Loading...", { duration: null, loading: true });

    try {
      await Promise.all(
        changedHabits.map((habit) =>
          apiFetch(`/api/habits/${habit._id}`, {
            method: "PATCH",
            body: JSON.stringify({ order: habit.order }),
          }),
        ),
      );
      showToast("✅ Habit order saved");
    } catch (error) {
      setHabits(originalHabits);
      syncArchiveHabitOrders(originalHabits);
      showToast(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ Failed to save habit order",
      );
    } finally {
      setSavingHabitOrder(false);
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
      const { habit } = await apiFetch(`/api/habits/${id}`, {
        method: "DELETE",
      });
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

  const totalPossibleHabitDays = habits.reduce(
    (sum, habit) => sum + getHabitGoalDays(habit),
    0,
  );

  function overallPct() {
    return totalPossibleHabitDays
      ? Math.round((totalDoneMonth() / totalPossibleHabitDays) * 100)
      : 0;
  }
  function perfectDays() {
    let count = 0;
    for (let d = 1; d <= days; d++) {
      const trackableHabits = habits.filter((h) => habitExistsOnDay(h, d));
      if (
        trackableHabits.length > 0 &&
        trackableHabits.every((h) => isDone(h._id, d))
      ) {
        count++;
      }
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
    const trackableHabits = habits.filter((h) => habitExistsOnDay(h, day));
    if (!trackableHabits.length) return 0;
    const cnt = trackableHabits.filter((h) => isDone(h._id, day)).length;
    return cnt / trackableHabits.length;
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
      const goalDays = getHabitGoalDays(habit);
      const completionPct = goalDays
        ? Math.round((completed / goalDays) * 100)
        : 0;

      return {
        ...habit,
        completed,
        completionPct,
        goalDays,
        streak: currentStreak(habit._id),
      };
    })
    .sort(
      (a, b) =>
        b.completionPct - a.completionPct ||
        b.completed - a.completed ||
        a.name.localeCompare(b.name),
    );
  const activeArchiveHabits = sortHabitsByOrder(
    archiveHabits.filter((habit) => habit.active),
  );
  const deletedArchiveHabits = sortHabitsByOrder(
    archiveHabits.filter((habit) => !habit.active),
  );

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

  async function enableDailyReminder() {
    if (!isValidReminderTime(notificationTime)) {
      showToast("Choose a valid reminder time");
      return;
    }

    const support = getNotificationPermissionState();

    if (support === "unsupported") {
      setNotificationPermission("unsupported");
      setNotificationEnabled(false);
      showToast("This browser does not support notifications.");
      return;
    }

    if (support === "insecure") {
      setNotificationPermission("insecure");
      setNotificationEnabled(false);
      showToast("Notifications need HTTPS or localhost.");
      return;
    }

    let permission = window.Notification.permission;

    if (permission === "default") {
      permission = await window.Notification.requestPermission();
    }

    setNotificationPermission(permission);

    if (permission === "granted") {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        setNotificationEnabled(false);
        showToast(
          "VAPID public key is missing. Restart the dev server after adding env keys.",
        );
        return;
      }

      const subscription = await subscribeToPushNotifications(publicKey);

      if (!subscription) {
        setNotificationEnabled(false);
        showToast("Could not create a push subscription. Try refreshing once.");
        return;
      }

      setNotificationEnabled(true);
      showToast(
        `Daily reminder set. Next alert: ${formatNextReminderDate(notificationTime)}.`,
      );
      return;
    }

    setNotificationEnabled(false);
    showToast(
      "Notifications are blocked. Allow them in browser site settings.",
    );
  }

  function disableDailyReminder() {
    setNotificationEnabled(false);
    showToast("Daily reminder turned off");
  }

  async function toggleDailyReminder() {
    if (notificationEnabled) {
      disableDailyReminder();
      return;
    }

    await enableDailyReminder();
  }

  async function previewDailyReminder() {
    const title = "Daily activity check-in";
    const body = "Update today's habits and keep your progress current.";
    const support = getNotificationPermissionState();

    if (support === "unsupported") {
      setNotificationPermission("unsupported");
      showToast("This browser does not support notifications.");
      return;
    }

    if (support === "insecure") {
      setNotificationPermission("insecure");
      showToast("Notifications need HTTPS or localhost.");
      return;
    }

    if ("Notification" in window) {
      let permission = window.Notification.permission;

      if (permission === "default") {
        permission = await window.Notification.requestPermission();
      }

      setNotificationPermission(permission);

      if (permission === "granted") {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
        const tag = `habitee-preview-${currentUser.id}`;
        const webPushResult = await sendWebPushNotification({
          body,
          publicKey,
          tag,
          title,
        });

        if (webPushResult.sent) {
          const soundPlayed = await playNotificationSound(0.6);
          showToast(
            soundPlayed
              ? "Windows test notification sent with sound"
              : "Windows test notification sent",
          );
          return;
        }

        const { notificationShown, soundPlayed } =
          await showComprehensiveNotification({
            body,
            tag,
            title,
            playSound: true,
            volumeLevel: 0.6,
          });

        showToast(
          notificationShown
            ? soundPlayed
              ? "Local test notification sent with sound"
              : "Local test notification sent"
            : webPushResult.error === "missing-vapid-public-key"
              ? "VAPID public key is missing. Restart the dev server after adding env keys."
              : "Could not show the notification. Check browser permissions.",
        );
        return;
      }
    }

    showToast(
      "Notifications are blocked. Allow them in browser site settings.",
    );
  }

  async function logout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  function renderHabitNameContent(h: Habit) {
    return editingHabitId === h._id ? (
      <div ref={renameControlRef} className={styles.habitRenameControl}>
        <input
          className={styles.habitRenameInput}
          value={editingHabitName}
          onChange={(event) => {
            setEditingHabitName(event.target.value);
            setRenameHadDuplicateError(false);
          }}
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
          minLength={HABIT_NAME_MIN_LENGTH}
          maxLength={HABIT_NAME_MAX_LENGTH}
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
    );
  }

  function renderDayCell(h: Habit, d: number) {
    const done = isDone(h._id, d);
    const missed = isMissed(h, d);
    const isToday = isCurrentMonth && d === todayDay;
    const isLocked = !canToggleDay(d);
    const tKey = `${h._id}-${d}`;

    return (
      <div
        key={`cell-${h._id}-${d}`}
        className={[
          styles.dayCell,
          done ? styles.done : "",
          missed ? styles.missed : "",
          isLocked ? styles.locked : "",
          isToday ? styles.today : "",
          toggling === tKey ? styles.toggling : "",
        ].join(" ")}
        onClick={() => canToggleDay(d) && toggle(h._id, d)}
        title={
          canToggleDay(d)
            ? `${h.name} - ${missed ? "mark complete" : "mark today"}`
            : `${h.name} - only today or yesterday can be marked`
        }
      />
    );
  }

  function renderTrackerSkeleton() {
    const skeletonRows = 5;
    const rowIndexes = Array.from({ length: skeletonRows }, (_, i) => i);
    const dayIndexes = Array.from({ length: days }, (_, i) => i + 1);

    if (pinTaskColumn) {
      return (
        <div
          className={`${styles.pinnedGridShell} ${styles.trackerSkeleton}`}
          role="status"
          aria-label="Loading habits"
        >
          <div
            className={styles.pinnedTaskColumn}
            style={{
              gridTemplateRows: `var(--tracker-header-row) repeat(${skeletonRows}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
            }}
          >
            <div className={[styles.ghLabel, styles.habitHeaderCell].join(" ")}>
              Habit
            </div>
            {rowIndexes.map((row) => (
              <div key={`skeleton-habit-${row}`} className={styles.skeletonHabitName}>
                <span className={styles.skeletonHabitIcon} />
                <span
                  className={styles.skeletonHabitLabel}
                  style={{ width: `${row % 2 === 0 ? 68 : 52}%` }}
                />
              </div>
            ))}
            <div className={styles.sumLabel}>Daily %</div>
          </div>

          <div className={styles.dateGridScroll}>
            <div
              className={styles.dateGrid}
              style={{
                gridTemplateColumns: `repeat(${days}, minmax(28px,1fr))`,
                gridTemplateRows: `var(--tracker-header-row) repeat(${skeletonRows}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
              }}
            >
              {dayIndexes.map((d) => (
                <div
                  key={`skeleton-day-${d}`}
                  className={`${styles.ghLabel} ${isCurrentMonth && d === now.getDate() ? styles.todayLabel : ""}`}
                >
                  {d}
                </div>
              ))}
              {rowIndexes.map((row) =>
                dayIndexes.map((d) => (
                  <div
                    key={`skeleton-cell-${row}-${d}`}
                    className={styles.skeletonDayCell}
                  />
                )),
              )}
              {dayIndexes.map((d) => (
                <div key={`skeleton-sum-${d}`} className={styles.skeletonSumCell} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`${styles.innerGrid} ${styles.trackerSkeleton}`}
        role="status"
        aria-label="Loading habits"
        style={{
          gridTemplateColumns: `220px repeat(${days}, minmax(28px,1fr))`,
          gridTemplateRows: `var(--tracker-header-row) repeat(${skeletonRows}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
        }}
      >
        <div
          className={[
            styles.ghLabel,
            styles.habitHeaderCell,
            pinTaskColumn ? styles.stickyFirstCol : "",
          ].join(" ")}
        >
          Habit
        </div>
        {dayIndexes.map((d) => (
          <div
            key={`skeleton-day-${d}`}
            className={`${styles.ghLabel} ${isCurrentMonth && d === now.getDate() ? styles.todayLabel : ""}`}
          >
            {d}
          </div>
        ))}
        {rowIndexes.map((row) => (
          <div key={`skeleton-row-${row}`} className={styles.rowGroup}>
            <div className={styles.skeletonHabitName}>
              <span className={styles.skeletonHabitIcon} />
              <span
                className={styles.skeletonHabitLabel}
                style={{ width: `${row % 2 === 0 ? 68 : 52}%` }}
              />
            </div>
            {dayIndexes.map((d) => (
              <div
                key={`skeleton-cell-${row}-${d}`}
                className={styles.skeletonDayCell}
              />
            ))}
          </div>
        ))}
        <div
          className={`${styles.sumLabel} ${pinTaskColumn ? styles.stickyFirstCol : ""}`}
        >
          Daily %
        </div>
        {dayIndexes.map((d) => (
          <div key={`skeleton-sum-${d}`} className={styles.skeletonSumCell} />
        ))}
      </div>
    );
  }

  function renderStreaksSkeleton() {
    return (
      <>
        <div className={styles.sectionTitle} style={{ marginTop: 28 }}>
          Current Streaks
        </div>
        <div
          className={`${styles.streaksRow} ${styles.streaksSkeleton}`}
          role="status"
          aria-label="Loading current streaks"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <div key={`streak-skeleton-${i}`} className={styles.streakCard}>
              <div
                className={`${styles.skeletonBlock} ${styles.skeletonStreakName}`}
              />
              <div
                className={`${styles.skeletonBlock} ${styles.skeletonStreakValue}`}
              />
              <div className={styles.streakBar}>
                <div
                  className={`${styles.skeletonBlock} ${styles.skeletonStreakFill}`}
                  style={{ width: `${[64, 42, 78, 56][i]}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderInsightsSkeleton() {
    const chartTicks = Array.from({ length: 5 }, (_, i) => i);
    const xLabels = Array.from({ length: Math.min(days, 12) }, (_, i) => i);

    return (
      <>
        <div className={styles.sectionTitle}>Insights</div>
        <div
          className={`${styles.chartGrid} ${styles.insightsSkeleton}`}
          role="status"
          aria-label="Loading insights"
        >
          <div className={`${styles.chartSection} ${styles.dailyChartSection}`}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitle}>
                Daily Completion Rate — {MONTHS[viewMonth]} {viewYear}
              </div>
              <div className={styles.chartStats}>
                <div className={`${styles.chartStat} ${styles.skeletonChartStat}`} />
                <div className={`${styles.chartStat} ${styles.skeletonChartStat}`} />
              </div>
            </div>

            <div className={styles.chartPlot}>
              <div className={styles.chartPlotInner}>
                <div className={styles.chartYAxis}>
                  {chartTicks.map((tick) => (
                    <span
                      key={`chart-y-skeleton-${tick}`}
                      className={`${styles.skeletonBlock} ${styles.skeletonAxisLabel}`}
                    />
                  ))}
                </div>
                <div className={`${styles.chartCanvas} ${styles.skeletonChartCanvas}`}>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonChartArea}`} />
                  <div className={`${styles.skeletonBlock} ${styles.skeletonChartLine}`} />
                  <div className={`${styles.skeletonBlock} ${styles.skeletonChartPoint}`} />
                </div>
                <div className={styles.chartXAxis}>
                  {xLabels.map((label) => (
                    <span
                      key={`chart-x-skeleton-${label}`}
                      className={`${styles.skeletonBlock} ${styles.skeletonXAxisLabel}`}
                    />
                  ))}
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
                <div className={`${styles.chartStat} ${styles.skeletonChartStat}`} />
                <div className={`${styles.chartStat} ${styles.skeletonChartStat}`} />
              </div>
            </div>

            <div className={styles.habitBars}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={`habit-bar-skeleton-${i}`} className={styles.habitBarRow}>
                  <div className={styles.habitBarHeader}>
                    <div className={styles.habitBarName}>
                      <span
                        className={`${styles.skeletonBlock} ${styles.skeletonHabitBarIcon}`}
                      />
                      <span
                        className={`${styles.skeletonBlock} ${styles.skeletonHabitBarLabel}`}
                        style={{ width: `${[58, 46, 66, 52, 62][i]}%` }}
                      />
                    </div>
                    <div
                      className={`${styles.skeletonBlock} ${styles.skeletonHabitBarValue}`}
                    />
                  </div>
                  <div className={styles.habitBarTrack}>
                    <div
                      className={`${styles.skeletonBlock} ${styles.skeletonHabitBarFill}`}
                      style={{ width: `${[72, 48, 86, 60, 54][i]}%` }}
                    />
                  </div>
                  <div className={styles.habitBarMeta}>
                    <span
                      className={`${styles.skeletonBlock} ${styles.skeletonHabitBarMeta}`}
                    />
                    <span
                      className={`${styles.skeletonBlock} ${styles.skeletonHabitBarMeta}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const notificationStatus =
    notificationPermission === "insecure"
      ? "Notifications need HTTPS or localhost."
      : notificationPermission === "unsupported"
        ? "This browser does not support notifications."
        : notificationPermission === "denied"
          ? "Notifications are blocked. Allow them in browser site settings, then set the reminder again."
          : notificationEnabled
            ? `Next alert: ${formatNextReminderDate(notificationTime)}. Keep this page open for the scheduled alert.`
            : "Daily reminder is off. Allow notifications, then set a time.";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <DndProvider backend={HTML5Backend}>
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
            <button
              type="button"
              className={`${styles.avatarButton} ${
                settingsOpen ? styles.avatarButtonActive : ""
              }`}
              onClick={() => setSettingsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              aria-label="Open settings"
              title="Open settings"
            >
              <span className={styles.avatarInitial}>{userInitial}</span>
            </button>
          </div>
        </div>
      </header>

      {settingsOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.settingsHeader}>
              <div className={styles.settingsIdentity}>
                <div className={styles.settingsAvatar}>{userInitial}</div>
                <div className={styles.settingsUserText}>
                  {/* <h3 id="settings-title" className={styles.settingsTitle}>
                    Settings
                  </h3> */}
                  <div className={styles.settingsName}>{currentUser.name}</div>
                  <div className={styles.settingsEmail}>
                    {currentUser.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.settingsClose}
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>

            <div className={styles.settingsBody}>
              <section className={styles.settingsSection}>
                <div className={styles.themeHeader}>
                  <div>
                    <div className={styles.settingsSectionTitle}>Theme</div>
                    <p className={styles.settingsHint}>
                      Choose how Habitee looks on this device.
                    </p>
                  </div>
                  <ThemeToggle />
                </div>
              </section>

              <section className={styles.settingsSection}>
                <div className={styles.notificationHeader}>
                  <div>
                    <div className={styles.settingsSectionTitle}>
                      Notifications
                    </div>
                    <p className={styles.settingsHint}>
                      Set a daily time to update your activities.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.switchButton} ${
                      notificationEnabled ? styles.switchButtonOn : ""
                    }`}
                    role="switch"
                    aria-checked={notificationEnabled}
                    onClick={toggleDailyReminder}
                  >
                    <span className={styles.switchThumb} />
                  </button>
                </div>

                <label className={styles.timeField}>
                  <span>Reminder time</span>
                  <input
                    type="time"
                    value={notificationTime}
                    onChange={(event) => {
                      setNotificationTime(event.target.value);
                      setNotificationLastSentDate("");
                      notificationLastSentDateRef.current = "";
                    }}
                  />
                </label>

                <div className={styles.notificationStatus}>
                  {notificationStatus}
                </div>

                <div className={styles.notificationActions}>
                  <button
                    type="button"
                    className={styles.settingsAction}
                    onClick={enableDailyReminder}
                  >
                    {notificationEnabled ? "Update reminder" : "Set reminder"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.settingsAction} ${styles.settingsActionSecondary}`}
                    onClick={previewDailyReminder}
                  >
                    Test now
                  </button>
                </div>
              </section>

              <button
                type="button"
                className={styles.settingsLogout}
                onClick={logout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          renderTrackerSkeleton()
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
        ) : pinTaskColumn ? (
          <div className={styles.pinnedGridShell}>
            <div
              className={styles.pinnedTaskColumn}
              style={{
                gridTemplateRows: `var(--tracker-header-row) repeat(${habits.length}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
              }}
            >
              <div
                className={[styles.ghLabel, styles.habitHeaderCell].join(" ")}
              >
                Habit
              </div>

              {habits.map((h, hi) => (
                <HabitNameCell
                  key={`task-${h._id}`}
                  habit={h}
                  index={hi}
                  animationDelay={`${hi * 0.04}s`}
                  dragDisabled={
                    savingHabitOrder ||
                    Boolean(renamingHabitId) ||
                    editingHabitId === h._id
                  }
                  isDraggingHabit={draggingHabitId === h._id}
                  onBeginRename={beginRenameHabit}
                  onDragStart={startHabitDrag}
                  onDragEnd={finishHabitDrag}
                  onMoveHabit={moveHabit}
                >
                  {renderHabitNameContent(h)}
                </HabitNameCell>
              ))}

              <div className={styles.sumLabel}>Daily %</div>
            </div>

            <div className={styles.dateGridScroll}>
              <div
                className={styles.dateGrid}
                style={{
                  gridTemplateColumns: `repeat(${days}, minmax(28px,1fr))`,
                  gridTemplateRows: `var(--tracker-header-row) repeat(${habits.length}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
                }}
              >
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    className={`${styles.ghLabel} ${isCurrentMonth && d === now.getDate() ? styles.todayLabel : ""}`}
                  >
                    {d}
                  </div>
                ))}

                {habits.map((h) =>
                  Array.from({ length: days }, (_, i) => i + 1).map((d) =>
                    renderDayCell(h, d),
                  ),
                )}

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
            </div>
          </div>
        ) : (
          <div
            className={styles.innerGrid}
            style={{
              gridTemplateColumns: `220px repeat(${days}, minmax(28px,1fr))`,
              gridTemplateRows: `var(--tracker-header-row) repeat(${habits.length}, var(--tracker-habit-row)) var(--tracker-summary-row)`,
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
                <HabitNameCell
                  habit={h}
                  index={hi}
                  animationDelay={`${hi * 0.04}s`}
                  dragDisabled={
                    savingHabitOrder ||
                    Boolean(renamingHabitId) ||
                    editingHabitId === h._id
                  }
                  isDraggingHabit={draggingHabitId === h._id}
                  onBeginRename={beginRenameHabit}
                  onDragStart={startHabitDrag}
                  onDragEnd={finishHabitDrag}
                  onMoveHabit={moveHabit}
                >
                  {renderHabitNameContent(h)}
                </HabitNameCell>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) =>
                  renderDayCell(h, d),
                )}
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
      {loading ? (
        renderStreaksSkeleton()
      ) : habits.length > 0 && (
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
      {loading ? (
        renderInsightsSkeleton()
      ) : habits.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Insights</div>
          <div className={styles.chartGrid}>
            <div
              className={`${styles.chartSection} ${styles.dailyChartSection}`}
            >
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
                      gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: days }, (_, index) => index + 1).map(
                      (day) => {
                        // Show every 5th day plus the month-end day, avoiding a 30/31 collision.
                        const shouldShowLabel =
                          day === days || (day % 5 === 0 && day + 1 < days);

                        return (
                          <span
                            key={day}
                            className={`${styles.chartXAxisLabel} ${
                              hoveredDailyDay === day
                                ? styles.chartXAxisLabelActive
                                : ""
                            }`}
                            onMouseEnter={() => setHoveredDailyDay(day)}
                          >
                            {shouldShowLabel ? day : ""}
                          </span>
                        );
                      },
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
                        {habit.completed}/{habit.goalDays} days
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
            minLength={HABIT_NAME_MIN_LENGTH}
            maxLength={HABIT_NAME_MAX_LENGTH}
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
          All Habits
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
                  All Habits
                </h3>
              </div>
              <button
                type="button"
                className={styles.archiveClose}
                onClick={closeHabitArchive}
                disabled={Boolean(archiveActionId)}
                aria-label="Close all habits"
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
                  aria-label="Loading all habits"
                />
              </div>
            ) : (
              <div className={styles.archiveBody}>
                <section className={styles.archiveGroup}>
                  <div className={styles.archiveGroupTitle}>
                    <span>Current Habits</span>
                    <span>{activeArchiveHabits.length}</span>
                  </div>
                  <div className={styles.archiveList}>
                    {activeArchiveHabits.length > 0 ? (
                      activeArchiveHabits.map((habit) => {
                        const isEditingDetails =
                          editingHabitId === habit._id &&
                          editingHabitIconId === habit._id;
                        const isSavingDetails =
                          renamingHabitId === habit._id ||
                          updatingHabitIconId === habit._id;
                        const anotherHabitIsBusy =
                          (Boolean(renamingHabitId) &&
                            renamingHabitId !== habit._id) ||
                          (Boolean(updatingHabitIconId) &&
                            updatingHabitIconId !== habit._id);

                        return (
                          <div
                            key={habit._id}
                            className={`${styles.archiveItem} ${styles.archiveItemCurrent}`}
                          >
                          <div className={styles.archiveHabitName}>
                            {isEditingDetails ? (
                              <input
                                className={styles.archiveIconInput}
                                value={editingHabitIcon}
                                onChange={(event) =>
                                  setEditingHabitIcon(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    void saveEditedHabitDetails(habit._id);
                                  }

                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEditHabitDetails();
                                  }
                                }}
                                maxLength={4}
                                disabled={
                                  isSavingDetails
                                }
                                aria-label={`Change ${habit.name} icon`}
                                autoFocus
                              />
                            ) : (
                              <span className={styles.archiveIcon}>
                                {habit.icon}
                              </span>
                            )}
                            {isEditingDetails ? (
                              <input
                                className={styles.archiveNameInput}
                                value={editingHabitName}
                                onChange={(event) => {
                                  setEditingHabitName(event.target.value);
                                  setRenameHadDuplicateError(false);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    void saveEditedHabitDetails(habit._id);
                                  }

                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEditHabitDetails();
                                  }
                                }}
                                minLength={HABIT_NAME_MIN_LENGTH}
                                maxLength={HABIT_NAME_MAX_LENGTH}
                                disabled={
                                  isSavingDetails
                                }
                                aria-label={`Rename ${habit.name}`}
                              />
                            ) : (
                              <span>{habit.name}</span>
                            )}
                          </div>
                          <div
                            className={`${styles.archiveActions} ${styles.archiveCurrentActions}`}
                          >
                            <button
                              type="button"
                              className={`${styles.archiveActionBtn} ${styles.archiveIconActionBtn} ${styles.archiveEditBtn}`}
                              onClick={() => {
                                if (isEditingDetails) {
                                  void saveEditedHabitDetails(habit._id);
                                } else {
                                  beginEditHabitDetails(habit);
                                }
                              }}
                              disabled={
                                isSavingDetails || anotherHabitIsBusy
                              }
                              aria-label={
                                isEditingDetails
                                  ? `Save ${habit.name}`
                                  : `Edit ${habit.name}`
                              }
                            >
                              {isEditingDetails ? "✓" : "✎"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.archiveActionBtn} ${styles.archiveIconActionBtn} ${styles.archivePermanentBtn}`}
                              onClick={() =>
                                requestRemoveHabit(habit._id, habit.name)
                              }
                              disabled={
                                Boolean(removingHabitId) ||
                                isEditingDetails ||
                                anotherHabitIsBusy
                              }
                              aria-label={`Delete ${habit.name}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <div className={styles.archiveEmpty}>
                        No current habits
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
              {deletedDuplicate.logCount === 1 ? "log" : "logs"}. Restore it or
              create a new habit with the same name?
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
        role="status"
        aria-live="polite"
      >
        {toast.loading ? (
          <ClipLoader
            size={14}
            color={loaderColor}
            loading
            aria-label="Loading"
          />
        ) : null}
        <span>{toast.msg}</span>
      </div>
      </div>
    </DndProvider>
  );
}
