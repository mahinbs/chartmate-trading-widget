import { useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AFFILIATE_REF_KEY = "affiliate_ref";
const AFFILIATE_ID_KEY = "affiliate_id";

function getStoredRef(): string | null {
  try {
    return sessionStorage.getItem(AFFILIATE_REF_KEY);
  } catch {
    return null;
  }
}

function setStoredRef(ref: string | null): void {
  try {
    if (ref) sessionStorage.setItem(AFFILIATE_REF_KEY, ref);
    else sessionStorage.removeItem(AFFILIATE_REF_KEY);
  } catch {}
}

function getStoredAffiliateId(): string | null {
  try {
    return sessionStorage.getItem(AFFILIATE_ID_KEY);
  } catch {
    return null;
  }
}

function setStoredAffiliateId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(AFFILIATE_ID_KEY, id);
    else sessionStorage.removeItem(AFFILIATE_ID_KEY);
  } catch {}
}

/**
 * Reads ?ref=CODE from URL, stores in sessionStorage, and calls edge function to record visit (unique IP).
 * Returns current affiliate_id so forms/payments can attach it.
 */
export function useAffiliateRef() {
  const [searchParams, setSearchParams] = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  const [affiliateId, setAffiliateId] = useState<string | null>(() => getStoredAffiliateId());
  const recordedRef = useRef<string | null>(null);

  const recordVisitAndResolveId = useCallback(async (code: string) => {
    if (recordedRef.current === code) return;
    try {
      await supabase.functions.invoke("record-affiliate-visit", { body: { ref: code } });
      recordedRef.current = code;
      const { data: rows } = await (supabase as any)
        .from("affiliates")
        .select("id")
        .eq("code", code)
        .eq("is_active", true)
        .limit(1);
      const id = rows?.[0]?.id ?? null;
      setAffiliateId(id);
      setStoredAffiliateId(id);
    } catch (e) {
      console.warn("Affiliate visit record failed:", e);
    }
  }, []);

  useEffect(() => {
    const code = refFromUrl?.trim() || null;
    if (code) {
      setStoredRef(code);
      recordVisitAndResolveId(code);
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      const newSearch = url.searchParams.toString();
      const newPath = url.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState({}, "", newPath);
      setSearchParams(url.searchParams, { replace: true });
    }
  }, [refFromUrl, recordVisitAndResolveId, setSearchParams]);

  useEffect(() => {
    const stored = getStoredRef();
    if (!stored) return;
    const storedId = getStoredAffiliateId();
    if (storedId) setAffiliateId(storedId);
    else recordVisitAndResolveId(stored);
  }, []);

  const clearRef = useCallback(() => {
    setStoredRef(null);
    setStoredAffiliateId(null);
    setAffiliateId(null);
    recordedRef.current = null;
  }, []);

  const storedRefCode = getStoredRef();

  return { affiliateId, clearRef, storedRefCode };
}
