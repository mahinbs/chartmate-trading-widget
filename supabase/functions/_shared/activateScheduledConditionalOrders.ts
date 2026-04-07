/**
 * Move pending_conditional_orders from `scheduled` → `pending` when scheduled_for has passed,
 * then insert entry_point_alerts so the in-app bell (realtime on entry_point_alerts) updates.
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export async function activateScheduledConditionalOrdersAndNotify(
  supabase: SupabaseLike,
  nowIso: string,
): Promise<{ activated: number }> {
  const { data: activatedScheduled, error: activateErr } = await supabase
    .from("pending_conditional_orders")
    .update({
      status: "pending",
      error_message: "Condition monitoring started at scheduled time.",
    })
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .select("id, user_id, strategy_id, symbol, is_paper_trade, scheduled_for");

  if (activateErr) {
    console.error("activate scheduled pending_conditional_orders:", activateErr);
    return { activated: 0 };
  }
  if (!activatedScheduled?.length) {
    return { activated: 0 };
  }

  const stratIds = [
    ...new Set(
      activatedScheduled.map((r: { strategy_id: string }) => r.strategy_id).filter(Boolean),
    ),
  ];
  const { data: stratRows } = stratIds.length > 0
    ? await supabase.from("user_strategies").select("id, name").in("id", stratIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map(
    (stratRows ?? []).map((s: { id: string; name: string }) => [
      s.id,
      String(s.name ?? "").trim() || "Strategy",
    ]),
  );

  for (const row of activatedScheduled as Array<{
    id: string;
    user_id: string;
    strategy_id: string;
    symbol: string;
    is_paper_trade: boolean | null;
    scheduled_for: string | null;
  }>) {
    const sym = String(row.symbol ?? "").trim().toUpperCase() || "—";
    const stratName = nameById.get(row.strategy_id) ?? "Your strategy";
    const paper = Boolean(row.is_paper_trade);
    const title = paper
      ? `Paper strategy monitoring started · ${sym}`
      : `Strategy order monitoring started · ${sym}`;
    const when = row.scheduled_for
      ? new Date(row.scheduled_for).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      : "now";
    const message =
      `${stratName} is now watching ${sym} for entry conditions in real time (scheduled start: ${when} IST).`;

    const { error: bellErr } = await supabase.from("entry_point_alerts").insert({
      user_id: row.user_id,
      symbol: sym,
      title,
      message,
      metadata: {
        source: "scheduled_conditional_activation",
        pending_conditional_order_id: row.id,
        strategy_id: row.strategy_id,
        is_paper_trade: paper,
        scheduled_for: row.scheduled_for,
      },
    });
    if (bellErr) {
      console.error("entry_point_alerts scheduled activation:", bellErr, row.id);
    }
  }

  return { activated: activatedScheduled.length };
}
