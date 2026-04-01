import { Button } from "@/components/ui/button";

/**
 * Shared pricing matrix (Starter / Growth / Professional + one-time fee)
 * for AI trading analysis landing and main marketing page.
 */
export function TradingSmartPricingMatrix() {
  return (
    <div className="container mx-auto px-4 max-w-6xl pb-8 relative">
      <h2 className="font-bebas text-4xl md:text-5xl text-center text-white mb-10 md:mb-16">
        PRICING
      </h2>
      <div className="-mx-4 px-4 pb-4 scrollbar-thin scrollbar-thumb-zinc-800">
        <table className="min-w-[720px] w-full text-left font-ibm-sans border-collapse relative z-10">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="py-6 px-4 font-normal text-zinc-600 underline decoration-zinc-800 underline-offset-4">
                FEATURES
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">Starter</div>
                <div className="font-ibm-mono text-teal-400 mt-1">49$ /month</div>
              </th>

              <th className="py-6 px-6 text-center w-1/4 bg-amber-400/[0.03] border-x border-t border-amber-400/20 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 font-ibm-mono text-[10px] bg-amber-400 text-black px-3 py-1 font-bold">
                  POPULAR
                </div>
                <div className="font-bebas text-3xl text-white">Growth</div>
                <div className="font-ibm-mono text-amber-400 mt-1">99$ /month</div>
              </th>

              <th className="py-6 px-6 text-center w-1/4">
                <div className="font-bebas text-3xl text-white">Professional</div>
                <div className="font-ibm-mono text-teal-400 mt-1">199$ /month</div>
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Target Audience</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Beginner</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Scaling Traders
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Advanced</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Strategy Configuration</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">1 strategy</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-200">
                Up to 3 strategies
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">
                Multiple strategies
              </td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Analytics</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Analytical reports</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm bg-amber-400/[0.03] border-x border-amber-400/20">
                Advanced reports
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Deep analytics</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Backtesting Tools</td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
              <td className="py-5 px-6 text-center bg-amber-400/[0.03] border-x border-amber-400/20 text-amber-400">
                ✓
              </td>
              <td className="py-5 px-6 text-center text-teal-400">✓</td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Processing Speed</td>
              <td className="py-5 px-6 text-center text-zinc-700">—</td>
              <td className="py-5 px-6 text-center bg-amber-400/[0.03] border-x border-amber-400/20 font-ibm-mono text-sm">
                Faster processing
              </td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">
                Faster config cycles
              </td>
            </tr>
            <tr className="border-b border-zinc-800/50 hover:bg-white/[0.01]">
              <td className="py-5 px-4 font-light text-zinc-400 text-sm">Support Level</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Standard support</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm">Priority support</td>
              <td className="py-5 px-6 text-center font-ibm-mono text-sm text-teal-400">Dedicated support</td>
            </tr>
            <tr className="border-b border-zinc-800">
              <td className="py-6 px-4 align-middle" aria-hidden />
              <td className="py-6 px-6 text-center align-middle">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider border-teal-500/40 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
                >
                  Subscribe
                </Button>
              </td>
              <td className="py-6 px-6 text-center align-middle bg-amber-400/[0.03] border-x border-b border-amber-400/20">
                <Button
                  type="button"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300"
                >
                  Subscribe
                </Button>
              </td>
              <td className="py-6 px-6 text-center align-middle">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-[200px] mx-auto font-ibm-mono text-xs uppercase tracking-wider border-teal-500/40 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300"
                >
                  Subscribe
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-10 md:mt-16 border-t border-zinc-800 pt-8 md:pt-10 text-center relative z-10">
        <h3 className="text-3xl md:text-5xl text-amber-400 mb-2">ONE-TIME CONFIGURATION FEE: 299$</h3>
        <p className="font-ibm-mono text-xs text-zinc-500">
          (Depends on complexity of user-defined strategy)
        </p>
      </div>
    </div>
  );
}
