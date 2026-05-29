import { useMemo, useState } from "react";
import { FaArrowLeft, FaArrowRight, FaCheck, FaUser } from "react-icons/fa6";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "@/styles/onboarding-access.css";

const STEP_NAMES = [
  "Personal Info",
  "KYC",
  "Trading Profile",
  "Broker & API",
  "Risk & Consent",
  "Review & Submit",
];

type WizardForm = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  idType: string;
  idNumber: string;
  address1: string;
  address2: string;
  capital: string;
  currency: "INR" | "USD";
  risk: "Low" | "Medium" | "High" | "";
  experience: string;
  markets: string[];
  broker: string;
  clientId: string;
  c1: boolean;
  c2: boolean;
  c3: boolean;
  c4: boolean;
  finalConfirm: boolean;
};

const SELECTED_BROKER_KEY = "algo_selected_broker";
const DEFAULT_BROKER_OPTIONS = ["Zerodha", "Fyers", "Upstox", "Angel One"];

/** Broker the user picked on the free dashboard before paying (if any). */
function readPresetBroker(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(SELECTED_BROKER_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

const initialForm = (name: string, email: string): WizardForm => ({
  fullName: name,
  email,
  phone: "",
  country: "",
  city: "",
  idType: "",
  idNumber: "",
  address1: "",
  address2: "",
  capital: "",
  currency: "INR",
  risk: "",
  experience: "",
  markets: [],
  broker: readPresetBroker(),
  clientId: "",
  c1: false,
  c2: false,
  c3: false,
  c4: false,
  finalConfirm: false,
});

function brokerLabelToValue(label: string): string {
  const m: Record<string, string> = {
    Zerodha: "zerodha",
    Upstox: "upstox",
    "Angel One": "angel",
    Fyers: "fyers",
    Other: "other",
  };
  return m[label] ?? label.toLowerCase().replace(/\s+/g, "_");
}

function experienceToDb(exp: string): string | null {
  const e = exp.trim();
  if (/beginner/i.test(e)) return "beginner";
  if (/intermediate/i.test(e)) return "intermediate";
  if (/advanced/i.test(e)) return "advanced";
  return null;
}

function riskToDb(r: string): "low" | "medium" | "high" {
  const x = r.toLowerCase();
  if (x === "low" || x === "medium" || x === "high") return x;
  return "medium";
}

function deriveTradeType(markets: string[]): string {
  if (markets.some((m) => m === "Options" || m === "Futures")) return "fno";
  if (markets.includes("Equity")) return "stocks";
  if (markets.includes("Crypto")) return "currency";
  return "mixed";
}

type Props = {
  userId: string;
  userEmail: string;
  defaultName: string;
  planId: string;
  onboardingId?: string | null;
  onSuccess: () => void;
  onCancel?: () => void;
};

export function AlgoOnboardingWizard({
  userId,
  userEmail,
  defaultName,
  planId,
  onboardingId,
  onSuccess,
  onCancel,
}: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(() => initialForm(defaultName, userEmail));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pct = useMemo(() => Math.round((step / STEP_NAMES.length) * 100), [step]);

  const next = () => {
    setErr(null);
    if (step === 1) {
      if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
        setErr("Please fill name, email, and phone.");
        return;
      }
    }
    if (step === 2) {
      if (!form.idType || !form.idNumber.trim()) {
        setErr("Please provide ID type and ID number.");
        return;
      }
    }
    if (step === 3) {
      if (!form.risk) {
        setErr("Select your risk appetite.");
        return;
      }
      if (!form.experience) {
        setErr("Select your experience level.");
        return;
      }
    }
    if (step === 4 && !form.broker) {
      setErr("Please select a preferred broker.");
      return;
    }
    if (step === 5 && (!form.c1 || !form.c2 || !form.c3 || !form.c4)) {
      setErr("Please accept all disclosures.");
      return;
    }
    if (step < STEP_NAMES.length) setStep((s) => s + 1);
  };

  const prev = () => {
    setErr(null);
    if (step > 1) setStep((s) => s - 1);
  };

  const toggleMarket = (m: string) => {
    setForm((f) => ({
      ...f,
      markets: f.markets.includes(m) ? f.markets.filter((x) => x !== m) : [...f.markets, m],
    }));
  };

  const submit = async () => {
    if (!form.finalConfirm || !form.c1 || !form.c2 || !form.c3 || !form.c4) {
      setErr("Please accept all disclosures and confirm your details.");
      return;
    }
    // Pre-flight: confirm we actually have a signed-in user before
    // hitting the DB. Without user_id, RLS rejects the insert with a
    // generic "permission denied" that's hard to debug. Catching this
    // here gives a clear, actionable message.
    if (!userId) {
      const msg =
        "You're not signed in. Please sign in or create an account, then resubmit.";
      setErr(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const kyc = {
        idType: form.idType,
        idNumber: form.idNumber,
        address1: form.address1,
        address2: form.address2,
        city: form.city,
        country: form.country,
      };
      const cap = form.capital.trim() ? parseFloat(form.capital) : null;
      const te = experienceToDb(form.experience) ?? "beginner";
      const tradeType = deriveTradeType(form.markets);
      const effectiveBroker = brokerLabelToValue(form.broker);

      const payload = {
        user_id: userId,
        plan_id: planId,
        full_name: form.fullName.trim(),
        phone: form.phone.trim() || null,
        broker: effectiveBroker,
        broker_client_id: form.clientId.trim() || null,
        capital_amount: cap,
        capital_currency: form.currency,
        risk_level: riskToDb(form.risk),
        trade_type: tradeType,
        trading_experience: te,
        preferred_timeframe: null,
        target_profit_pct: null,
        stop_loss_pct: null,
        max_drawdown_pct: null,
        leverage_preference: null,
        custom_leverage: null,
        trading_goal: null,
        trading_frequency: null,
        strategy_pref: null,
        custom_strategy: null,
        risk_acknowledged: true,
        notes: `Markets: ${form.markets.join(", ") || "—"}. Email on form: ${form.email}.`,
        kyc_payload: kyc,
        markets: form.markets.length ? form.markets : null,
        status: "pending",
        rejection_reason: null,
        rejected_at: null,
        provisioned_at: null,
      };
      const query = onboardingId
        ? (supabase as any).from("algo_onboarding").update(payload).eq("id", onboardingId)
        : (supabase as any).from("algo_onboarding").insert(payload);
      const { error } = await query;
      if (error) throw error;
      onSuccess();
    } catch (e: unknown) {
      // Defensive error reporting: prior version showed only e.message
      // via toast (often a cryptic Supabase string), no console detail.
      // When a user reports "submit failed" we had nothing to go on.
      // Now: dump the full error object to console (code, hint, details,
      // message) AND show a user-visible message that's specific enough
      // to triage — auth issues, RLS, missing column, network — each
      // gets distinct copy. Also call setErr so the on-form red banner
      // shows the reason in case the toast was missed.
      const err = e as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
        name?: string;
      };
      console.error("[AlgoOnboarding submit] full error:", {
        name: err?.name,
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        raw: e,
      });

      let userMsg = "Submit failed. Please try again or contact support.";
      const code = err?.code || "";
      const msg = err?.message || "";

      if (code === "42501" || /permission denied|RLS|policy/i.test(msg)) {
        userMsg =
          "Your session has expired. Please sign out and back in, then resubmit.";
      } else if (code === "23505" || /duplicate/i.test(msg)) {
        userMsg =
          "It looks like you already submitted this application. Refresh the page to see your current status.";
      } else if (code === "23502" || /null value.*not-null/i.test(msg)) {
        userMsg =
          "A required field is missing on our side. We're being notified; please contact support if this persists.";
      } else if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
        userMsg =
          "Application service is temporarily misconfigured. We're being notified; please try again in a few minutes.";
      } else if (/fetch|network|failed to/i.test(msg)) {
        userMsg =
          "Network error reaching our server. Check your connection and retry.";
      } else if (msg) {
        // Last resort: show the raw message but prefix it so support
        // can quickly identify the source class.
        userMsg = `Submit failed: ${msg}`;
      }

      setErr(userMsg);
      toast.error(userMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard-access-scope">
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>
      <div className="scanlines" />
      <div className="onboard-wrapper">
        <div className="progress-header">
          <div className="progress-info">
            <span className="progress-step-text">
              Step {step} of {STEP_NAMES.length}
            </span>
            <span className="progress-pct">{pct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-dots">
            {STEP_NAMES.map((name, i) => {
              const n = i + 1;
              const cls = n < step ? "done" : n === step ? "active" : "";
              return (
                <div key={name} className={`progress-dot ${cls}`}>
                  <div className="progress-dot-circle">{n < step ? <FaCheck aria-hidden="true" /> : n}</div>
                  <div className="progress-dot-label">{name}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="onboard-body">
          <div className="onboard-card">
            {err && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(244,63,94,0.1)",
                  border: "1px solid rgba(244,63,94,0.2)",
                  color: "#f43f5e",
                  fontSize: 12,
                }}
              >
                {err}
              </div>
            )}

            {step === 1 && (
              <div className="step active">
                <div className="step-title">Personal Information</div>
                <div className="step-subtitle">Let&apos;s start with your basic details</div>
                <div className="section-label">
                  <FaUser aria-hidden="true" /> Basic Details
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Full Name <span className="req">*</span></label>
                    <input
                      className="form-input"
                      value={form.fullName}
                      readOnly
                      disabled
                      title="Name comes from your account profile"
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email <span className="req">*</span></label>
                    <input
                      className="form-input"
                      type="email"
                      value={form.email}
                      readOnly
                      disabled
                      title="Email comes from your account profile"
                      placeholder="trader@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone <span className="req">*</span></label>
                    <input className="form-input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <select className="form-select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                      <option value="">Select Country</option>
                      <option>India</option>
                      <option>United States</option>
                      <option>United Kingdom</option>
                      <option>Singapore</option>
                      <option>UAE</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mumbai" />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="step active">
                <div className="step-title">KYC &amp; Verification</div>
                <div className="step-subtitle">Identity details (documents verified manually by our team)</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">ID Type <span className="req">*</span></label>
                    <select className="form-select" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                      <option value="">Select</option>
                      <option>PAN Card</option>
                      <option>Passport</option>
                      <option>Aadhaar</option>
                      <option>Driver&apos;s License</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ID Number <span className="req">*</span></label>
                    <input className="form-input" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Address</label>
                    <input className="form-input" value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} placeholder="Street" />
                  </div>
                  <div className="form-group full">
                    <input className="form-input" value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} placeholder="Apt, suite…" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="step active">
                <div className="step-title">Trading Profile</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Capital</label>
                    <input className="form-input" type="number" value={form.capital} onChange={(e) => setForm({ ...form, capital: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as "INR" | "USD" })}>
                      <option>INR</option>
                      <option>USD</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label className="form-label">Risk appetite</label>
                  <div className="radio-group">
                    {["Low", "Medium", "High"].map((r) => (
                      <label key={r} className={`radio-option ${form.risk === r ? "selected" : ""}`}>
                        <input type="radio" name="risk" checked={form.risk === r} onChange={() => setForm({ ...form, risk: r as "Low" | "Medium" | "High" })} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="section-label">Markets</div>
                <div className="checkbox-group">
                  {["Equity", "Options", "Futures", "Crypto"].map((m) => (
                    <label key={m} className={`checkbox-option ${form.markets.includes(m) ? "selected" : ""}`}>
                      <input type="checkbox" checked={form.markets.includes(m)} onChange={() => toggleMarket(m)} />
                      {m}
                    </label>
                  ))}
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Experience</label>
                  <select className="form-select" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                    <option value="">Select</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="step active">
                <div className="step-title">Broker &amp; API</div>
                <p className="step-subtitle">Intent only — you will connect the live broker after we provision ChartMate access.</p>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Preferred broker</label>
                    <select className="form-select" value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })}>
                      <option value="">Select</option>
                      {form.broker &&
                        !DEFAULT_BROKER_OPTIONS.includes(form.broker) &&
                        form.broker !== "Other" && (
                          <option value={form.broker}>{form.broker}</option>
                        )}
                      <option>Zerodha</option>
                      <option>Fyers</option>
                      <option>Upstox</option>
                      <option>Angel One</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client ID (optional)</label>
                    <input className="form-input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="step active">
                <div className="step-title">Risk &amp; consent</div>
                <div className="consent-box">
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c1} onChange={(e) => setForm({ ...form, c1: e.target.checked })} />
                    <span>I understand algorithmic trading involves substantial financial risk.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c2} onChange={(e) => setForm({ ...form, c2: e.target.checked })} />
                    <span>I accept responsibility for losses from automated trading.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c3} onChange={(e) => setForm({ ...form, c3: e.target.checked })} />
                    <span>I acknowledge no guaranteed returns.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c4} onChange={(e) => setForm({ ...form, c4: e.target.checked })} />
                    <span>I authorize ChartMate to execute automated orders once my broker is connected.</span>
                  </label>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="step active">
                <div className="step-title">Review &amp; submit</div>
                <div className="review-grid">
                  <div className="review-card">
                    <div className="review-card-title">Personal</div>
                    <div className="review-item"><span className="review-item-label">Name</span><span className="review-item-value">{form.fullName}</span></div>
                    <div className="review-item"><span className="review-item-label">Email</span><span className="review-item-value">{form.email}</span></div>
                    <div className="review-item"><span className="review-item-label">Phone</span><span className="review-item-value">{form.phone}</span></div>
                  </div>
                  <div className="review-card">
                    <div className="review-card-title">Trading</div>
                    <div className="review-item"><span className="review-item-label">Capital</span><span className="review-item-value">{form.currency} {form.capital}</span></div>
                    <div className="review-item"><span className="review-item-label">Risk</span><span className="review-item-value">{form.risk || "—"}</span></div>
                    <div className="review-item"><span className="review-item-label">Broker</span><span className="review-item-value">{form.broker || "—"}</span></div>
                  </div>
                </div>
                <label className={`checkbox-option ${form.finalConfirm ? "selected" : ""}`} style={{ marginTop: 16 }}>
                  <input type="checkbox" checked={form.finalConfirm} onChange={(e) => setForm({ ...form, finalConfirm: e.target.checked })} />
                  I confirm the details are correct
                </label>
              </div>
            )}

            <div className="btn-row">
              {step > 1 && (
                <button type="button" className="btn btn-back" onClick={prev}>
                  <FaArrowLeft aria-hidden="true" /> Back
                </button>
              )}
              {step < STEP_NAMES.length ? (
                <button type="button" className="btn btn-next" onClick={next}>
                  Next <FaArrowRight aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="btn btn-submit" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Submitting…" : "Submit application"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
