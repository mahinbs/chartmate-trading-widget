import { PRICING_PLANS_INR } from "@/constants/pricing";
import { resolveDisplayCurrency } from "@/lib/resolveDisplayCurrency";

const PRO_PLAN =
  PRICING_PLANS_INR.find((p) => p.id === "professionalPlan") ?? PRICING_PLANS_INR[0];

function fmtInr(n: number) {
  return n.toLocaleString("en-IN");
}

/**
 * The home page (`/`) embeds `landing.html` with hardcoded USD. After mount,
 * swap the #pricing block to INR when `resolveDisplayCurrency()` says India.
 */
export async function applyInrToEmbeddedLandingPricing(root: HTMLElement | null) {
  if (!root) return;
  const mode = await resolveDisplayCurrency();
  if (mode !== "INR") return;

  const section = root.querySelector<HTMLElement>("#pricing");
  if (!section) return;

  const desc = section.querySelector<HTMLElement>(".section-head .section-desc");
  if (desc) {
    desc.innerHTML = `One Algo Platform plan: <strong>₹${fmtInr(PRO_PLAN.integrationFee)}</strong> one-time integration + <strong>₹${fmtInr(PRO_PLAN.price)}/mo</strong> maintenance (billing begins after the first 30 days).`;
  }

  const cards = section.querySelectorAll<HTMLElement>(".pricing .price-card");
  const tiers = [PRO_PLAN];
  for (let i = 0; i < Math.min(cards.length, tiers.length); i++) {
    const card = cards[i];
    const t = tiers[i];
    const tags = card.querySelectorAll<HTMLElement>(".price-tag");
    if (tags[0]) tags[0].textContent = "Integration";
    if (tags[1]) tags[1].textContent = "Maintenance";

    const integ = card.querySelector<HTMLElement>(".price-amount:not(.sub)");
    const month = card.querySelector<HTMLElement>(".price-amount.sub");
    if (integ) {
      integ.innerHTML = `<span class="cur">₹</span>${fmtInr(t.integrationFee)}`;
    }
    if (month) {
      month.innerHTML = `<span class="cur">₹</span>${fmtInr(t.price)}<span class="per">/month</span>`;
    }
  }

  const note = section.querySelector<HTMLElement>(".pricing-note");
  if (note) {
    note.textContent =
      "Integration covers broker API setup, strategy deployment, and go-live validation. Monthly covers hosting, monitoring, and support. Indian customers are billed in INR where applicable.";
  }

  section.querySelectorAll<HTMLAnchorElement>('a[href^="/auth?subscribe_plan="]').forEach((a) => {
    try {
      const u = new URL(a.href, window.location.origin);
      u.searchParams.set("currency", "INR");
      a.setAttribute("href", u.pathname + u.search);
    } catch {
      a.href = "/auth?currency=INR";
    }
  });
}
