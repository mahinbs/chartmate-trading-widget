import { useEffect, useMemo, useState } from "react";
import type { TrialLogRecord, TrialOrderRecord, TrialTimelineFrame } from "@/lib/trial-data/types";

function takeLatestByTimestamp<T extends { timestampIso: string }>(
  rows: T[],
  count: number,
): T[] {
  return [...rows]
    .sort((a, b) => Date.parse(b.timestampIso) - Date.parse(a.timestampIso))
    .slice(0, count);
}

export function useDeterministicTimelineFrame(
  orders: TrialOrderRecord[],
  logs: TrialLogRecord[],
  active: boolean,
  frameMs = 1200,
  maxOrders = 20,
  maxLogs = 50,
): TrialTimelineFrame {
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso)),
    [orders],
  );
  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso)),
    [logs],
  );

  const [cursor, setCursor] = useState(1);

  useEffect(() => {
    setCursor(1);
  }, [orders, logs]);

  useEffect(() => {
    if (!active) return;
    const total = Math.max(sortedOrders.length, sortedLogs.length);
    if (cursor >= total) return;
    const id = window.setTimeout(() => setCursor((c) => c + 1), frameMs);
    return () => window.clearTimeout(id);
  }, [active, cursor, frameMs, sortedOrders.length, sortedLogs.length]);

  return {
    orders: takeLatestByTimestamp(sortedOrders.slice(0, cursor), maxOrders),
    logs: takeLatestByTimestamp(sortedLogs.slice(0, cursor), maxLogs),
  };
}
