import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Marketing section: detailed tier matrix removed; subscriptions are configured in Stripe separately. */
export function TradingSmartPricingMatrix() {
  return (
    <div className="container mx-auto px-4 max-w-3xl pb-16 relative text-center">
      <h2 className="font-bebas text-4xl md:text-5xl text-white mb-6 md:mb-8">PRICING</h2>
      <p className="text-zinc-400 font-ibm-sans text-sm md:text-base leading-relaxed mb-8">
        Subscription options and checkout are being updated. See the pricing page for current plans,
        or contact us for white-label and enterprise licensing.
      </p>
      <Button
        asChild
        className="font-ibm-mono text-xs uppercase tracking-wider bg-teal-500 hover:bg-teal-400 text-black"
      >
        <Link to="/pricing">View pricing</Link>
      </Button>
    </div>
  );
}
