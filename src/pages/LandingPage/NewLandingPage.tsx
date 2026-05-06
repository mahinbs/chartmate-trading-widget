import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChartMatePricingMatrix } from "@/components/landingpage/TradingSmartPricingMatrix";
import { useAuth } from "@/hooks/useAuth";
import { applyInrToEmbeddedLandingPricing } from "@/lib/applyInrToEmbeddedLandingPricing";
import { PRICING_PLANS } from "@/constants/pricing";
import { premiumPlanCheckoutUrls } from "@/lib/premiumCheckoutUrls";
import { createCheckoutSession } from "@/services/stripeService";
import { isChartmateBrandActive, replaceTradingSmartBrand } from "@/lib/brandOverride";
import landingPageRaw from "./landing.html?raw";

const VALID_PREMIUM_PLANS = new Set(PRICING_PLANS.map((p) => p.id));

const bodyMatch    = landingPageRaw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const headMatch    = landingPageRaw.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
const titleMatch   = landingPageRaw.match(/<title>([\s\S]*?)<\/title>/i);
const descMatch    = landingPageRaw.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i);
const styleMatches = Array.from(landingPageRaw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi));
const scriptMatches = Array.from(landingPageRaw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
const linkMatches  = headMatch
  ? Array.from(headMatch[1].matchAll(/<link\b[^>]*\/?>/gi)).map(m => m[0])
  : [];

const BODY_HTML  = bodyMatch?.[1] ?? "";
const STYLES     = styleMatches.map(m => m[1]).join("\n");
const SCRIPTS    = scriptMatches.map(m => ({ attrs: m[1] ?? "", code: m[2] ?? "" }));
const TITLE_TEXT = titleMatch?.[1]?.trim() ?? "";
const DESC_TEXT  = descMatch?.[1] ?? "";

function parseAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}=["']([^"']+)["']`, "i");
  return attrs.match(re)?.[1] ?? null;
}

const NewLandingPage = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transitioning, setTransitioning] = useState<null | "dashboard" | "checkout">(null);
  const chartmateBrandActive = isChartmateBrandActive();
  const bodyHtml = chartmateBrandActive
    ? replaceTradingSmartBrand(BODY_HTML).replace(/\/logo\.png/gi, "/chartmate.png")
    : BODY_HTML;

  useEffect(() => {
    const head     = document.head;
    const injected: Element[] = [];
    const intervals: number[] = [];
    const timeouts:  number[] = [];
    const winListeners: Array<[string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]> = [];
    const docListeners: Array<[string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]> = [];

    // Patch window/document so we can clean up everything the inline scripts
    // register. Without this, navigating away from the landing leaks handlers
    // pointing at DOM that no longer exists.
    const origWinAdd  = window.addEventListener.bind(window);
    const origDocAdd  = document.addEventListener.bind(document);
    const origSetInt  = window.setInterval.bind(window);
    const origSetTo   = window.setTimeout.bind(window);

    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) => {
      winListeners.push([type, listener, opts]);
      origWinAdd(type, listener, opts as AddEventListenerOptions);
    }) as typeof window.addEventListener;

    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) => {
      docListeners.push([type, listener, opts]);
      origDocAdd(type, listener, opts as AddEventListenerOptions);
    }) as typeof document.addEventListener;

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = origSetInt(handler as () => void, timeout, ...args);
      intervals.push(id as unknown as number);
      return id;
    }) as typeof window.setInterval;

    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = origSetTo(handler as () => void, timeout, ...args);
      timeouts.push(id as unknown as number);
      return id;
    }) as typeof window.setTimeout;

    // SEO: title + description
    const prevTitle = document.title;
    if (TITLE_TEXT) document.title = TITLE_TEXT;
    let descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    let prevDesc: string | null = null;
    let createdDesc = false;
    if (DESC_TEXT) {
      if (descMeta) {
        prevDesc = descMeta.getAttribute("content");
        descMeta.setAttribute("content", DESC_TEXT);
      } else {
        descMeta = document.createElement("meta");
        descMeta.setAttribute("name", "description");
        descMeta.setAttribute("content", DESC_TEXT);
        head.appendChild(descMeta);
        createdDesc = true;
      }
    }

    // Head <link> tags (fonts, etc.)
    for (const linkHtml of linkMatches) {
      const tmp = document.createElement("div");
      tmp.innerHTML = linkHtml.trim();
      const link = tmp.firstElementChild as HTMLLinkElement | null;
      if (link) {
        link.setAttribute("data-landing", "1");
        head.appendChild(link);
        injected.push(link);
      }
    }

    // <style> blocks
    if (STYLES) {
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-landing", "1");
      styleEl.textContent = STYLES;
      head.appendChild(styleEl);
      injected.push(styleEl);
    }

    // Run inline scripts in order. innerHTML-injected <script> tags do not
    // execute, so we re-create them.
    for (const { attrs, code } of SCRIPTS) {
      const s = document.createElement("script");
      s.setAttribute("data-landing", "1");
      const src  = parseAttr(attrs, "src");
      const type = parseAttr(attrs, "type");
      if (type) s.type = type;
      if (src) {
        s.src = src;
        s.async = false;
      } else {
        s.textContent = code;
      }
      document.body.appendChild(s);
      injected.push(s);
    }

    return () => {
      // Restore originals first so cleanup calls below aren't intercepted.
      window.addEventListener = origWinAdd;
      document.addEventListener = origDocAdd;
      window.setInterval = origSetInt;
      window.setTimeout = origSetTo;

      for (const id of intervals) clearInterval(id);
      for (const id of timeouts)  clearTimeout(id);
      for (const [t, l, o] of winListeners) window.removeEventListener(t, l, o as AddEventListenerOptions);
      for (const [t, l, o] of docListeners) document.removeEventListener(t, l, o as AddEventListenerOptions);

      for (const el of injected) el.remove();

      if (TITLE_TEXT) document.title = prevTitle;
      if (DESC_TEXT && descMeta) {
        if (createdDesc) descMeta.remove();
        else if (prevDesc !== null) descMeta.setAttribute("content", prevDesc);
      }
    };
  }, []);

  const [pricingRoot, setPricingRoot] = useState<Element | null>(null);

  // After HTML is injected, find the placeholder and portal the React pricing matrix into it.
  useEffect(() => {
    const el = containerRef.current?.querySelector("#ts-pricing-react-root");
    if (el) setPricingRoot(el);
  }, []);

  useEffect(() => {
    const cta = containerRef.current?.querySelector(".nav-cta");
    if (!cta) return;
    if (user?.id) {
      cta.innerHTML = `
        <a href="/home" class="btn btn-primary" data-dashboard-link="1" target="_top">Dashboard</a>
      `;
      return;
    }
    cta.innerHTML = `
      <a href="/auth" class="btn btn-ghost" target="_top">Sign in</a>
      <a href="/auth" class="btn btn-primary" target="_top">Get started →</a>
    `;
  }, [user?.id]);

  // Intercept Dashboard clicks AND any auth-entry clicks (Sign in / Get
  // started / Create free account / Automate my strategy) when the user is
  // already signed in, so the navigation stays in-SPA with a branded
  // loader instead of flashing the /auth page before AuthPage's own
  // post-auth effect redirects to /home.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !user?.id) return;

    const handler = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (anchor.matches('[data-dashboard-link="1"]')) {
        e.preventDefault();
        setTransitioning("dashboard");
        navigate("/home");
        return;
      }

      const url = new URL(anchor.href, window.location.origin);
      const sameOrigin = url.origin === window.location.origin;
      const isAuthEntry =
        sameOrigin && (url.pathname === "/auth" || url.pathname === "/register");
      // subscribe_plan clicks are handled by the checkout intercept below —
      // leave them alone so that path creates a Stripe session instead.
      if (isAuthEntry && !url.searchParams.get("subscribe_plan")) {
        e.preventDefault();
        setTransitioning("dashboard");
        navigate("/home");
      }
    };

    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [user?.id, navigate]);

  useEffect(() => {
    // landing.html contains static USD markup; patch to INR for Indian users.
    void applyInrToEmbeddedLandingPricing(containerRef.current);
  }, []);

  // When a signed-in user clicks a pricing CTA, skip the /auth round-trip
  // and go straight to Stripe. Without this, the user sees a flash of the
  // signin page while AuthPage's own post-auth effect races to redirect.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !user?.id) return;

    const handler = async (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest("a[href*=\"subscribe_plan=\"]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      // Let modified clicks (cmd/ctrl/middle/shift) open normally.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const url = new URL(target.href, window.location.origin);
      const plan = url.searchParams.get("subscribe_plan")?.trim() ?? "";
      if (!plan || !VALID_PREMIUM_PLANS.has(plan)) return;

      e.preventDefault();
      setTransitioning("checkout");
      const currencyParam = (url.searchParams.get("currency") ?? "").toUpperCase();
      const currency = currencyParam === "INR" ? "inr" : undefined;
      const { success_url, cancel_url } = premiumPlanCheckoutUrls(plan);
      const result = await createCheckoutSession({
        plan_id: plan,
        success_url,
        cancel_url,
        ...(currency ? { currency } : {}),
      });
      if ("url" in result && result.url) {
        window.location.href = result.url;
        return;
      }
      // Fall back to the auth flow so the toast + retry logic there can surface the error.
      setTransitioning(null);
      window.location.href = target.href;
    };

    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [user?.id]);

  return (
    <>
      <div
        ref={containerRef}
        className={chartmateBrandActive ? "chartmate-landing" : "tradingsmart-landing"}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {pricingRoot && createPortal(<ChartMatePricingMatrix />, pricingRoot)}
      {transitioning &&
        createPortal(<TransitionLoader variant={transitioning} chartmateBrandActive={chartmateBrandActive} />, document.body)}
    </>
  );
};

function TransitionLoader({
  variant,
  chartmateBrandActive,
}: {
  variant: "dashboard" | "checkout";
  chartmateBrandActive: boolean;
}) {
  const label = variant === "dashboard" ? "Loading your dashboard" : "Starting secure checkout";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(20,184,166,0.18), rgba(14,165,233,0.08) 40%, rgba(6,9,18,0.96) 70%)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "tsLoaderFadeIn 220ms ease-out both",
      }}
    >
      <style>{`
        @keyframes tsLoaderFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tsLoaderSpin { to { transform: rotate(360deg) } }
        @keyframes tsLoaderPulse { 0%, 100% { opacity: 0.55; transform: scale(0.96) } 50% { opacity: 1; transform: scale(1.04) } }
      `}</style>
      <div style={{ position: "relative", width: 88, height: 88 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "radial-gradient(circle at 50% 50%, rgba(20,184,166,0.35), transparent 65%)",
            filter: "blur(12px)",
            animation: "tsLoaderPulse 1.6s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.08)",
            borderTopColor: "#14b8a6",
            borderRightColor: "#0ea5e9",
            animation: "tsLoaderSpin 0.9s linear infinite",
          }}
        />
        <img
          src={chartmateBrandActive ? "/chartmate.png" : "/logo.png"}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            width: 44,
            height: 44,
            objectFit: "contain",
            filter: "drop-shadow(0 6px 18px rgba(20,184,166,0.45))",
          }}
        />
      </div>
      <div
        style={{
          fontFamily:
            '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#f0f6ff",
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "0.2px",
          textAlign: "center",
        }}
      >
        {label}
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "1.5ch",
            textAlign: "left",
            color: "#14b8a6",
          }}
        >
          …
        </span>
      </div>
    </div>
  );
}

export default NewLandingPage;
