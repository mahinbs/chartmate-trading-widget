import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";

export default function RaProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const safeSlug = slug ?? "ra-profile";

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <Helmet>
        <title>{`RA Profile | ${safeSlug} | ChartMate.ai`}</title>
        <meta
          name="description"
          content="Research analyst profile page on ChartMate.ai marketplace."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-card/40 p-8">
        <h1 className="text-2xl font-semibold">Research Analyst Profile</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Profile slug: <span className="font-medium text-foreground">{safeSlug}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This route exists and is ready for detailed RA profile content.
        </p>

        <div className="mt-6">
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to={`/ra/${safeSlug}/strategy/demo-strategy`}
          >
            Open sample strategy checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
