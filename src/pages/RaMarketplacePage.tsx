import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

export default function RaMarketplacePage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <Helmet>
        <title>SEBI RA Marketplace | ChartMate.ai</title>
        <meta
          name="description"
          content="Browse SEBI-registered research analyst profiles and strategies on ChartMate.ai."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-card/40 p-8">
        <h1 className="text-2xl font-semibold">SEBI RA Marketplace</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page is ready for marketplace listing integration.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          You can open a sample RA profile route from here.
        </p>

        <div className="mt-6">
          <Link className="text-primary underline-offset-4 hover:underline" to="/ra/sample-ra">
            Open sample RA profile
          </Link>
        </div>
      </div>
    </div>
  );
}
