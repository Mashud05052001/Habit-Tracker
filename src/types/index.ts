export interface Habit {
  _id: string;
  name: string;
  icon: string;
  order: number;
  active: boolean;
  createdAt: string;
}

export interface Log {
  _id: string;
  habitId: string;
  year: number;
  month: number;
  day: number;
  done: boolean;
}

export interface MonthData {
  habits: Habit[];
  logs: Log[];
}
