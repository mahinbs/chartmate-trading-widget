import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setTradingIntegration } from "@/services/openalgoIntegrationService";

/**
 * Handles return from broker OAuth (e.g. Zerodha via OpenAlgo).
 * OpenAlgo redirects here with fragment: #broker_token=...&broker=zerodha
 * We save the token and redirect to /predict.
 */
export default function BrokerCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"saving" | "done" | "error">("saving");
  const [message, setMessage] = useState("Connecting your broker…");

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.hash.slice(1) || window.location.search.slice(1)
    );
    const brokerToken = params.get("broker_token");
    const broker = (params.get("broker") || "zerodha").toLowerCase();

    if (!brokerToken?.trim()) {
      setStatus("error");
      setMessage("Missing token. Please try connecting again from ChartMate.");
      return;
    }

    (async () => {
      const { error } = await setTradingIntegration({
        broker,
        broker_token: brokerToken.trim(),
      });
      if (error) {
        setStatus("error");
        setMessage(error);
        return;
      }
      setStatus("done");
      setMessage("Broker connected. Taking you to Predict…");
      navigate("/predict", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
      <div className="text-muted-foreground text-center max-w-sm">
        {status === "saving" && (
          <>
            <div className="animate-pulse h-8 w-8 rounded-full bg-primary/20 mx-auto mb-3" />
            <p>{message}</p>
          </>
        )}
        {status === "done" && <p>{message}</p>}
        {status === "error" && (
          <>
            <p className="text-destructive font-medium">{message}</p>
            <button
              type="button"
              onClick={() => navigate("/predict", { replace: true })}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Go to Predict
            </button>
          </>
        )}
      </div>
    </div>
  );
}
