const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const DEFAULT_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

function getKeysFromRequest(req: Request): string[] {
  const url = new URL(req.url);
  const raw = url.searchParams.get("keys");
  if (!raw) return DEFAULT_KEYS;

  const keys = raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  return keys.length > 0 ? keys : DEFAULT_KEYS;
}

Deno.serve((req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const keys = getKeysFromRequest(req);

  const values = keys.map((key) => {
    const value = Deno.env.get(key);
    return {
      key,
      found: Boolean(value),
      value: value ?? null, // Now returns the raw value instead of calling maskSecret()
      length: value?.length ?? 0,
    };
  });

  return new Response(
    JSON.stringify(
      {
        ok: true,
        checked: keys.length,
        values,
      },
      null,
      2,
    ),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
});