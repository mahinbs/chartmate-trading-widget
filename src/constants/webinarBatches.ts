export type WebinarSessionPattern = {
  weekday: number; // 0=Sunday ... 6=Saturday
  hourIST: number;
  minuteIST: number;
  durationMinutes: number;
};

export type WebinarBatchDefinition = {
  code: string;
  name: string;
  tagline: string;
  sessionsLabel: string[];
  sessionPattern: WebinarSessionPattern[];
};

export const WEBINAR_BATCH_DEFINITIONS: WebinarBatchDefinition[] = [
  {
    code: "batch_1",
    name: "Batch 1",
    tagline: "Mon / Wed / Fri - 3:00 PM to 4:00 PM IST",
    sessionsLabel: [
      "Monday 3:00 PM to 4:00 PM",
      "Wednesday 3:00 PM to 4:00 PM",
      "Friday 3:00 PM to 4:00 PM",
    ],
    sessionPattern: [
      { weekday: 1, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
      { weekday: 3, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
      { weekday: 5, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
    ],
  },
  {
    code: "batch_2",
    name: "Batch 2",
    tagline: "Tue / Thu / Sat - 3:00 PM to 4:00 PM IST",
    sessionsLabel: [
      "Tuesday 3:00 PM to 4:00 PM",
      "Thursday 3:00 PM to 4:00 PM",
      "Saturday 3:00 PM to 4:00 PM",
    ],
    sessionPattern: [
      { weekday: 2, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
      { weekday: 4, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
      { weekday: 6, hourIST: 15, minuteIST: 0, durationMinutes: 60 },
    ],
  },
  {
    code: "batch_3",
    name: "Batch 3",
    tagline: "Wed / Fri / Sat - 2:00 PM to 3:00 PM IST",
    sessionsLabel: [
      "Wednesday 2:00 PM to 3:00 PM",
      "Friday 2:00 PM to 3:00 PM",
      "Saturday 2:00 PM to 3:00 PM",
    ],
    sessionPattern: [
      { weekday: 3, hourIST: 14, minuteIST: 0, durationMinutes: 60 },
      { weekday: 5, hourIST: 14, minuteIST: 0, durationMinutes: 60 },
      { weekday: 6, hourIST: 14, minuteIST: 0, durationMinutes: 60 },
    ],
  },
];

export const DEFAULT_TRIAL_LIMITS = {
  /** Daily pool for backtest / AI analysis / paper trade (10 credits each). */
  dailyCreditLimit: 100,
  backtestsPerDay: 10,
  paperTradesPerDay: 10,
  aiAnalysisPerDay: 10,
  strategyCreationsPerDay: 1,
};
