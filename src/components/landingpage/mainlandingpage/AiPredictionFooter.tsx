import React from "react";
import { Link } from "react-router-dom";
import logoImg from "@/assets/logo.png";

const NAV_ITEMS = [
  { id: "hero", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "market-picks", label: "Daily Analysis", isRoute: true },
];

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;

  const headerOffset = 80;
  const rect = el.getBoundingClientRect();
  const offsetTop = rect.top + window.scrollY - headerOffset;

  window.scrollTo({
    top: offsetTop,
    behavior: "smooth",
  });
};

const AiPredictionFooter: React.FC = () => {
  const year = new Date().getFullYear();

  const handleNavClick = (id: string) => {
    scrollToSection(id);
  };

  return (
    <footer className="border-t border-white/10 bg-black/90 py-8 text-xs text-gray-400">
      <div className="container flex flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
        <div className="space-y-2">
          <img
            src={logoImg}
            alt="TradingSmart.ai"
            className="w-[7.5rem] md:w-[10rem]"
          />
          <p className="text-sm font-semibold text-white">
            TradingSmart.ai – AI-Powered Market Predictions
          </p>
          <p className="max-w-xl text-[11px] leading-relaxed text-gray-500">
            Data-driven probabilities for Stocks, Forex &amp; Crypto. Not
            signals or investment advice. Always trade with proper risk
            management.
          </p>
          <p className="text-[11px] text-gray-600">
            © {year} TradingSmart.ai. All rights reserved.
          </p>
        </div>

        <nav className="flex flex-wrap justify-center gap-3 md:justify-end">
          {NAV_ITEMS.map((item) => (
            item.isRoute ? (
              <Link
                key={item.id}
                to={`/${item.id}`}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-300 hover:border-cyan-500/60 hover:text-white hover:bg-cyan-500/10 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gray-300 hover:border-cyan-500/60 hover:text-white hover:bg-cyan-500/10 transition-colors"
              >
                {item.label}
              </button>
            )
          ))}
        </nav>
      </div>
    </footer>
  );
};

export default AiPredictionFooter;
