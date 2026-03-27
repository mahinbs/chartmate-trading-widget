import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import gsap from "gsap";
import {
  Activity,
  BarChart3,
  Bot,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Newspaper,
  ShieldCheck,
  Target,
  User,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardNavLink } from "./dashboard-nav-types";
import { isDashboardNavActive } from "./dashboard-nav-types";
import { DashboardMobileDrawer } from "./DashboardMobileDrawer";
import { cn } from "@/lib/utils";

export interface DashboardSidebarProps {
  className?: string;
  widthClassName?: string;
}

function useDashboardNavLinks(): DashboardNavLink[] {
  const { isAdmin } = useAdmin();
  const { isPremium } = useSubscription();
  const { user } = useAuth();
  const [algoStatus, setAlgoStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlgoStatus = async () => {
      if (!user?.id || !isPremium) {
        setAlgoStatus(null);
        return;
      }
      const { data } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      setAlgoStatus(data?.status ?? null);
    };
    fetchAlgoStatus();
  }, [user?.id, isPremium]);

  const isAlgoProvisioned =
    isPremium && (algoStatus === "provisioned" || algoStatus === "active");

  const links: DashboardNavLink[] = [
    { to: "/home", label: "Dashboard", icon: LayoutDashboard },
    { to: "/predict", label: "New Analysis", icon: LineChart },
    {
      to: "/predictions",
      label: "Past Analyses",
      icon: Activity,
      iconOpacity: "",
    },
    {
      to: "/active-trades?tab=completed",
      label: "Paper Trade Performance",
      icon: BarChart3,
    },
    { to: "/news", label: "News Feed", icon: Newspaper },
  ];

  if (isPremium) {
    if (isAlgoProvisioned) {
      links.push({
        to: "/trading-dashboard",
        label: "Algo Trade",
        icon: Bot,
        iconColor: "",
      });
      links.push({
        to: "/ai-trading-analysis",
        label: "AI Trading Analysis",
        icon: Target,
        iconColor: "",
      });
      links.push({
        to: "/backtest",
        label: "Backtesting",
        icon: LineChart,
        iconColor: "",
      });
    } else {
      links.push({
        to: "/algo-setup",
        label: "Algo Trade",
        icon: Bot,
        iconColor: "",
      });
    }
  } else {
    links.push({
      to: "/pricing",
      label: "Algo Trade",
      icon: Bot,
      iconColor: "",
    });
  }

  if (isAdmin) {
    links.push({
      to: "/admin",
      label: "Admin Panel",
      icon: ShieldCheck,
      iconColor: "text-destructive opacity-80",
    });
  }

  return links;
}

export function DashboardSidebar({
  className,
  widthClassName = "w-[240px]",
}: DashboardSidebarProps) {
  const { pathname, search } = useLocation();
  const { signOut, user } = useAuth();
  const links = useDashboardNavLinks();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const userEmail = user?.email;
  const userShortName = userEmail?.split("@")[0] ?? null;

  useEffect(() => {
    if (isMobileMenuOpen && mobileMenuRef.current) {
      gsap.fromTo(
        mobileMenuRef.current,
        { x: -500, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" },
      );
    }
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => {
    if (mobileMenuRef.current) {
      gsap.to(mobileMenuRef.current, {
        x: -500,
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => setIsMobileMenuOpen(false),
      });
    } else {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <aside
        className={cn(
          "shrink-0 border-r border-sidebar-border bg-sidebar flex-col h-full hidden lg:flex",
          widthClassName,
          className,
        )}
      >
        <div className="p-4 flex items-center justify-center mb-2 mt-2">
          <img
            src={logo}
            alt="ChartMate"
            className="w-[5rem] object-contain opacity-90"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-6 scrollbar-hide bg-gradient-to-br from-transparent via-transparent to-primary/20">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest px-2 mb-2.5 font-semibold opacity-80">
              Navigation
            </p>
            <div className="space-y-2">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = isDashboardNavActive(
                  link.to,
                  pathname,
                  search,
                );
                if (isActive) {
                  return (
                    <Link
                      key={link.label}
                      to={link.to}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-primary/10 text-primary border-l-[3px] border-primary text-sm font-semibold transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
                    >
                      <Icon className="h-4 w-4" /> {link.label}
                    </Link>
                  );
                }
                return (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-foreground hover:bg-sidebar-primary/5 transition-all text-sm font-medium border-l-[3px] border-transparent ml-[1px]"
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        link.iconColor,
                        link.iconOpacity,
                      )}
                    />{" "}
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-sidebar-border mt-auto bg-sidebar pb-6">
          <Link
            to="/contact-us"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-foreground hover:bg-white/5 glass-button-premium transition-all text-sm font-medium mb-3 border-l-[3px] border-transparent ml-[1px]"
          >
            <HelpCircle className="h-4 w-4 opacity-70" /> Help Center (FAQ)
          </Link>
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl border border-transparent hover:border-border hover:bg-sidebar-accent/50 cursor-pointer transition-colors group">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-foreground border border-border shrink-0 overflow-hidden shadow-sm">
              <User className="h-4 w-4 opacity-50" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-sm font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                {userShortName || "User"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {userEmail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-destructive transition-colors px-1"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className="lg:hidden fixed left-4 top-5 z-[85] p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-transparent hover:border-border bg-slate-950"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <DashboardMobileDrawer
        ref={mobileMenuRef}
        open={isMobileMenuOpen}
        onClose={closeMobileMenu}
        links={links}
        userEmail={userEmail}
        userShortName={userShortName}
        onSignOut={signOut}
      />
    </>
  );
}
