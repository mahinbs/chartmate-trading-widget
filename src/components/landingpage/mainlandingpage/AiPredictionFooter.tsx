import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logoImg from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";

const BASE_NAV_ITEMS = [
  { id: "hero", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "market-picks", label: "Daily Analysis", isRoute: true },
  { id: "white-label", label: "White Label", isRoute: true },
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
  const [hasBlogs, setHasBlogs] = useState(false);
  const [hasDashboard, setHasDashboard] = useState(false);

  useEffect(() => {
    const loadFlags = async () => {
      try {
        const [{ count: blogCount }, { count: dashCount }] = await Promise.all([
          supabase.from('blogs').select('id', { head: true, count: 'exact' }),
          supabase.from('public_dashboard_metrics').select('id', { head: true, count: 'exact' }),
        ]);
        setHasBlogs((blogCount ?? 0) > 0);
        setHasDashboard((dashCount ?? 0) > 0);
      } catch (e) {
        console.error('Footer flags error', e);
      }
    };
    loadFlags();
  }, []);

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(hasBlogs ? [{ id: "blogs", label: "Blogs", isRoute: true }] : []),
    ...(hasDashboard ? [{ id: "dashboard", label: "Dashboard", isRoute: true }] : []),
  ];

  const handleNavClick = (id: string) => {
    scrollToSection(id);
  };

  return (
    <footer className="border-t border-white/10 bg-black/90 py-8 text-xs text-gray-400">
      <div className="container flex flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
        <div className="space-y-3 flex flex-col items-center md:items-start">
          <img
            src={logoImg}
            alt="TradingSmart.ai"
            className="w-[6rem] md:w-[8rem]"
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
          {navItems.map((item) => (
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
