const GLOBAL_LP_URL = "/chartmatealgo/landing.html";

export default function GlobalLpTsaiPage() {

  return (
    <main className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
      <a className="underline" href={GLOBAL_LP_URL}>
        Open Global ChartMate LP
      </a>
    </main>
  );
}
