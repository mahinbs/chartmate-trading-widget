import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TradingSmartPricingMatrix } from "@/components/landingpage/TradingSmartPricingMatrix";
import { useAuth } from "@/hooks/useAuth";
import { applyInrToEmbeddedLandingPricing } from "@/lib/applyInrToEmbeddedLandingPricing";
import landingPageRaw from "./landing.html?raw";

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
        <a href="/home" class="btn btn-primary" target="_top">Dashboard</a>
      `;
      return;
    }
    cta.innerHTML = `
      <a href="/auth" class="btn btn-ghost" target="_top">Sign in</a>
      <a href="/auth" class="btn btn-primary" target="_top">Get started →</a>
    `;
  }, [user?.id]);

  useEffect(() => {
    // landing.html contains static USD markup; patch to INR for Indian users.
    void applyInrToEmbeddedLandingPricing(containerRef.current);
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="tradingsmart-landing"
        dangerouslySetInnerHTML={{ __html: BODY_HTML }}
      />
      {pricingRoot && createPortal(<TradingSmartPricingMatrix />, pricingRoot)}
    </>
  );
};

export default NewLandingPage;
