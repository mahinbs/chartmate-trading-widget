import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_ORIGIN = "https://www.chartmate.ai";

/**
 * Canonical + default robots on every route (SPA). Matches handoff: www + pathname.
 */
export function GlobalSeoHelmet() {
  const { pathname } = useLocation();
  const canonicalHref = `${SITE_ORIGIN}${pathname}`;

  return (
    <Helmet>
      <link rel="canonical" href={canonicalHref} />
      <meta name="robots" content="index, follow" />
    </Helmet>
  );
}
