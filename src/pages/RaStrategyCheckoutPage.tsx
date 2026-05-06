import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";

export default function RaStrategyCheckoutPage() {
  const { slug, strategyId } = useParams<{ slug: string; strategyId: string }>();
  const safeSlug = slug ?? "ra-profile";
  const safeStrategyId = strategyId ?? "strategy";

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <Helmet>
        <title>{`RA Strategy Checkout | ChartMate.ai`}</title>
        <meta
          name="description"
          content="Strategy checkout page for research analyst marketplace on ChartMate.ai."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-card/40 p-8">
        <h1 className="text-2xl font-semibold">RA Strategy Checkout</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Analyst: <span className="font-medium text-foreground">{safeSlug}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Strategy: <span className="font-medium text-foreground">{safeStrategyId}</span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          This route is active and ready for payment or subscription integration.
        </p>
      </div>
    </div>
  );
}
