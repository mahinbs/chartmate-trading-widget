import { useEffect } from "react";

const PROCESS_PAGE_URL = "/tradingsmartalgo/process.html";

export default function ProcessPage() {
  useEffect(() => {
    // Force full navigation so this route always loads the exact static HTML page.
    window.location.replace(PROCESS_PAGE_URL);
  }, []);

  return (
    <main className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
      <a className="underline" href={PROCESS_PAGE_URL}>
        Open Process Page
      </a>
    </main>
  );
}
