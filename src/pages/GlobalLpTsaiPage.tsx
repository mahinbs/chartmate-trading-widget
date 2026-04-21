import { useEffect } from "react";

const GLOBAL_LP_URL = "/tradingsmartalgo/landing.html";

export default function GlobalLpTsaiPage() {
  useEffect(() => {
    // Force a full-page navigation so this route always opens the exact global LP.
    window.location.replace(GLOBAL_LP_URL);
  }, []);

  return (
    <main className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
      <a className="underline" href={GLOBAL_LP_URL}>
        Open Global TradingSmart LP
      </a>
    </main>
  );
}
