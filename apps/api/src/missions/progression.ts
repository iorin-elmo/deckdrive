export interface LevelProgress {
  readonly experience: number;
  readonly level: number;
}

export interface LoginCycleProgress {
  readonly day: string;
  readonly cycleDay: number;
}

export function missionPeriodStart(cadence: 'DAILY' | 'WEEKLY', now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (cadence === 'DAILY') return day;
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

export function experienceForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('Level must be a positive integer.');
  return 100 * (level - 1) * level;
}

export function addExperience(current: LevelProgress, amount: number): LevelProgress {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Experience must be positive.');
  const experience = current.experience + amount;
  let level = current.level;
  while (experience >= experienceForLevel(level + 1)) level += 1;
  return { experience, level };
}

export function nextLoginCycle(
  now: Date,
  previous: LoginCycleProgress | undefined,
): LoginCycleProgress {
  const day = now.toISOString().slice(0, 'YYYY-MM-DD'.length);
  if (previous === undefined) return { day, cycleDay: 1 };
  if (previous.day === day) throw new Error('Login reward was already claimed today.');
  const priorDay = new Date(`${previous.day}T00:00:00.000Z`);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const consecutive =
    priorDay.toISOString().slice(0, 'YYYY-MM-DD'.length) ===
    yesterday.toISOString().slice(0, 'YYYY-MM-DD'.length);
  return { day, cycleDay: consecutive ? (previous.cycleDay % 7) + 1 : 1 };
}
