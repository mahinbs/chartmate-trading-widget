/**
 * Strategy guide Chapter 6 — gates we can enforce server-side before new entries.
 * (1% per trade / 2% daily loss / sizing need live PnL feed — optional extension.)
 */

export type GuideRiskGateConfig = {
  enforceGuideChapter6: boolean;
  maxOpenPositions: number;
  blockNewEntriesAfterHm: number | null; // minutes since midnight in `tz`, e.g. 14*60+45
  /** When set and Chapter 6 enforced: require takeProfitPct / stopLossPct ≥ this ratio (guide rule 5 ≈ 2). */
  minRiskRewardRatio: number | null;
};

const DEFAULT_MAX_OPEN = 3;

export function parseGuideRiskGates(riskConfig: unknown, timeZoneForSession: string): GuideRiskGateConfig {
  const r = riskConfig && typeof riskConfig === "object" ? (riskConfig as Record<string, unknown>) : {};
  const enforce =
    r.enforceGuideChapter6 === true ||
    r.guide_chapter6 === true ||
    r.guideChapter6 === true;
  const maxOpen = Math.max(1, Math.min(20, Math.floor(Number(r.maxOpenPositions ?? r.max_open_positions ?? DEFAULT_MAX_OPEN) || DEFAULT_MAX_OPEN)));
  const afterStr = String(r.blockNewEntriesAfter ?? r.no_new_entries_after ?? "").trim();
  let blockNewEntriesAfterHm: number | null = null;
  if (/^\d{1,2}:\d{2}$/.test(afterStr)) {
    const [hh, mm] = afterStr.split(":").map((x) => parseInt(x, 10));
    if (Number.isFinite(hh) && Number.isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      blockNewEntriesAfterHm = hh * 60 + mm;
    }
  }
  let minRiskRewardRatio: number | null = null;
  if (enforce) {
    const raw = Number(r.minRiskReward ?? r.min_risk_reward ?? r.guideMinRiskReward ?? 2);
    minRiskRewardRatio = Number.isFinite(raw) && raw > 0 ? Math.max(1, raw) : 2;
  }

  if (!enforce && blockNewEntriesAfterHm == null) {
    return {
      enforceGuideChapter6: false,
      maxOpenPositions: maxOpen,
      blockNewEntriesAfterHm: null,
      minRiskRewardRatio: null,
    };
  }
  return {
    enforceGuideChapter6: Boolean(enforce),
    maxOpenPositions: maxOpen,
    blockNewEntriesAfterHm,
    minRiskRewardRatio,
  };
}

function wallClockMinutes(tsSec: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(tsSec * 1000));
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

/** True = block this new entry (too late in session). */
export function guideBlocksNewEntryNow(nowSec: number, timeZone: string, blockAfterHm: number | null): boolean {
  if (blockAfterHm == null) return false;
  const m = wallClockMinutes(nowSec, timeZone);
  if (m == null) return false;
  return m > blockAfterHm;
}

export type GuideRiskDeny = { ok: false; reason: string; code: string } | { ok: true };

/** Call before placing a manual or conditional entry when guide enforcement is on. */
export function evaluateGuideRiskGates(input: {
  cfg: GuideRiskGateConfig;
  nowSec: number;
  timeZone: string;
  isIntraday: boolean;
  openPositionCount: number;
  /** Strategy saved % (price move), used for min R:R when both > 0 */
  stopLossPct?: number;
  takeProfitPct?: number;
}): GuideRiskDeny {
  const { cfg, nowSec, timeZone, isIntraday, openPositionCount, stopLossPct, takeProfitPct } = input;

  if (
    cfg.enforceGuideChapter6 &&
    cfg.minRiskRewardRatio != null
  ) {
    const sl = Number(stopLossPct ?? 0);
    const tp = Number(takeProfitPct ?? 0);
    if (sl > 0 && tp > 0 && tp / sl + 1e-9 < cfg.minRiskRewardRatio) {
      return {
        ok: false,
        code: "GUIDE_MIN_RISK_REWARD",
        reason: `Guide risk: target must be at least ${cfg.minRiskRewardRatio}× stop-loss (saved TP% / SL% = ${(tp / sl).toFixed(2)}:1).`,
      };
    }
  }

  if (cfg.enforceGuideChapter6 && openPositionCount >= cfg.maxOpenPositions) {
    return {
      ok: false,
      code: "GUIDE_MAX_POSITIONS",
      reason: `Guide risk: max ${cfg.maxOpenPositions} open position(s). Close one before a new entry.`,
    };
  }

  if (isIntraday && cfg.blockNewEntriesAfterHm != null && guideBlocksNewEntryNow(nowSec, timeZone, cfg.blockNewEntriesAfterHm)) {
    const h = Math.floor(cfg.blockNewEntriesAfterHm / 60);
    const mi = cfg.blockNewEntriesAfterHm % 60;
    return {
      ok: false,
      code: "GUIDE_NO_NEW_ENTRIES_LATE",
      reason: `Guide risk: no new intraday entries after ${h}:${String(mi).padStart(2, "0")} (${timeZone}).`,
    };
  }

  return { ok: true };
}
