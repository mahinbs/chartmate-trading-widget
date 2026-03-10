import React, { useState, useEffect } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
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

const AiPredictionHeader: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
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
        console.error('Navbar flags error', e);
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
    setIsOpen(false);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-2.5 lg:py-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => handleNavClick("hero")}
          >
            <img
              src={logoImg}
              alt="TradingSmart.ai"
              className="w-[6.5rem] lg:w-[8.5rem] object-contain"
            />
            {/* <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white tracking-wide">
                TradingSmart.ai
              </span>
              <span className="text-[10px] uppercase tracking-[0.25em] text-gray-400">
                Market Predictions
              </span>
            </div> */}
          </div>

          {/* Desktop nav */}
          <nav className="hidden 2xl:gap-12 gap-8 text-sm font-medium text-gray-300 lg:flex">
            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.id}
                  to={`/${item.id}`}
                  className="relative inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] hover:text-white transition-colors cursor-pointer group"
                >
                  <span>{item.label}</span>
                  <span className="absolute inset-x-0 -bottom-1 h-px scale-x-0 bg-linear-to-r from-primary to-secondary transition-transform duration-200 origin-center group-hover:scale-x-100" />
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="relative inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] hover:text-white transition-colors cursor-pointer group"
                >
                  <span>{item.label}</span>
                  <span className="absolute inset-x-0 -bottom-1 h-px scale-x-0 bg-linear-to-r from-primary to-secondary transition-transform duration-200 origin-center group-hover:scale-x-100" />
                </button>
              )
            ))}
          </nav>

          {/* Mobile menu button */}
          <button
            className="inline-flex items-center justify-center rounded-full border border-white/15 p-2 text-gray-200 lg:hidden"
            onClick={() => setIsOpen(true)}
            aria-label="Open navigation"
          >
            <FaBars className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile offcanvas menu */}
      <div
        className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-out lg:hidden ${isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        aria-hidden={!isOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          onClick={() => setIsOpen(false)}
        />

        {/* Panel */}
        <div className="absolute inset-y-0 right-0 w-72 max-w-[80vw] bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <img
                src={logoImg}
                alt="TradingSmart.ai"
                className="w-[4rem] lg:w-[5rem] object-contain"
              />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full border border-white/15 p-2 text-gray-300"
              onClick={() => setIsOpen(false)}
              aria-label="Close navigation"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex flex-col gap-2 px-6 py-4 text-sm">
            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.id}
                  to={`/${item.id}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
                >
                  <span className="text-xs uppercase tracking-[0.2em]">
                    {item.label}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-gray-200 hover:bg-white/5 hover:text-white transition-colors group"
                >
                  <span className="text-xs uppercase tracking-[0.2em]">
                    {item.label}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.6)] group-hover:scale-125 transition-transform" />
                </button>
              )
            ))}
          </nav>
        </div>
      </div>
    </>
  );
};

export default AiPredictionHeader;
