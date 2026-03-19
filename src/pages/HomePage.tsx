import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  image_url: string | null;
  published_at: string;
}
import { 
  Activity, BarChart3, PlusCircle, Eye, ShieldCheck, 
  KeyRound, BrainCircuit, Lock, Newspaper, BarChart2, 
  LayoutDashboard, LineChart, List, Calendar, Bot, 
  HelpCircle, Bell, Search, ChevronDown, User, LogOut,
  Menu, X
} from "lucide-react";
import gsap from "gsap";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useTradingIntegration } from "@/hooks/useTradingIntegration";
import { TradingIntegrationModal } from "@/components/trading/TradingIntegrationModal";
import { useSubscription } from "@/hooks/useSubscription";
import logo from '../assets/logo.png'
// import { PredictionChatbot } from "@/components/PredictionChatbot";
import YahooChartPanel from "@/components/YahooChartPanel";

const PREFERRED_STOCKS = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "EURUSD=X", name: "EUR/USD" },
  { symbol: "GC=F", name: "Gold" },
  { symbol: "NVDA", name: "NVIDIA Corp." }
];


export default function HomePage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isAdmin } = useAdmin();
  const { hasIntegration, save, refresh } = useTradingIntegration();
  const { isPremium } = useSubscription();
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [activeStock, setActiveStock] = useState(PREFERRED_STOCKS[0]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const canAccessOpenAlgoDashboard = isPremium && hasIntegration;

  const navLinks = [
    { to: "/home", label: "Dashboard", icon: LayoutDashboard },
    { to: "/predict", label: "New Analysis", icon: LineChart },
    { to: canAccessOpenAlgoDashboard ? '/trading-dashboard' : '/algo-setup', label: "Live Trading", icon: Activity },
    { to: "/predictions", label: "Past Analyses", icon: Activity, iconOpacity: "opacity-50" },
    { to: "/active-trades?tab=completed", label: "Performance", icon: BarChart3 },
    { to: "/active-trades", label: "Order List", icon: List },
    { to: "/news", label: "News Feed", icon: Newspaper },
    { to: "/tick-chart", label: "Live Tick Chart", icon: BarChart2 },
    { to: "/algo-setup", label: "Algo Trade", icon: Bot, iconColor: "text-primary opacity-80" },
  ];

  if (isAdmin) {
    navLinks.push({ to: "/admin", label: "Admin Panel", icon: ShieldCheck, iconColor: "text-destructive opacity-80" });
  }

  useEffect(() => {
    const fetchRecentNews = async () => {
      try {
        const { data, error } = await supabase
          .from('news' as any)
          .select('*')
          .order('published_at', { ascending: false })
          .limit(5);
        if (!error && data) {
          setNews((data as unknown as NewsArticle[]) || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchRecentNews();
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen && mobileMenuRef.current) {
      gsap.fromTo(
        mobileMenuRef.current,
        { x: -500, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
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
        onComplete: () => setIsMobileMenuOpen(false)
      });
    } else {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      
      {/* 🗂️ LEFT SIDEBAR (240px) */}
      <aside className="w-[240px] shrink-0 border-r border-sidebar-border bg-sidebar flex-col h-full hidden lg:flex">
        {/* Logo */}
        <div className="p-4 flex items-center justify-center mb-2 mt-2">
           <img src={logo} alt="ChartMate" className="w-[5rem] object-contain opacity-90" />
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-6 scrollbar-hide bg-gradient-to-br from-transparent via-transparent to-primary/20">
           {/* NAVIGATION */}
           <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest px-2 mb-2.5 font-semibold opacity-80">Navigation</p>
              <div className="space-y-2">
                 {navLinks.map((link) => {
                   const Icon = link.icon;
                   const isActive = link.to === "/home";
                   
                   if (isActive) {
                     return (
                       <Link key={link.to} to={link.to} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-primary/10 text-primary border-l-[3px] border-primary text-sm font-semibold transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
                          <Icon className="h-4 w-4" /> {link.label}
                       </Link>
                     );
                   }

                   return (
                     <Link key={link.to} to={link.to} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-foreground hover:bg-sidebar-primary/5 transition-all text-sm font-medium border-l-[3px] border-transparent ml-[1px]">
                        <Icon className={`h-4 w-4 ${link.iconColor || ''} ${link.iconOpacity || ''}`} /> {link.label}
                     </Link>
                   );
                 })}
              </div>
           </div>
        </div>

        {/* Footer Sidebar */}
        <div className="p-4 border-t border-sidebar-border mt-auto bg-sidebar pb-6">
           <Link to="/contact-us" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-foreground hover:bg-white/5 glass-button-premium transition-all text-sm font-medium mb-3 border-l-[3px] border-transparent ml-[1px]">
              <HelpCircle className="h-4 w-4 opacity-70" /> Help Center (FAQ)
           </Link>
           <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl border border-transparent hover:border-border hover:bg-sidebar-accent/50 cursor-pointer transition-colors group">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-foreground border border-border shrink-0 overflow-hidden shadow-sm">
                 <User className="h-4 w-4 opacity-50" />
              </div>
              <div className="flex-1 min-w-0 pr-2">
                 <p className="text-sm font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">{user?.email?.split('@')[0] || 'User'}</p>
                 <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{user?.email}</p>
              </div>
              <button onClick={() => signOut()} className="text-muted-foreground hover:text-destructive transition-colors px-1" title="Sign Out">
                 <LogOut className="h-4 w-4" />
              </button>
           </div>
        </div>
      </aside>

      {/* 📊 MAIN CONTENT AREA (flex-1) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative z-10">
         {/* Top Header */}
         <header className="h-[72px] gap-6 shrink-0 flex items-center px-6 lg:px-8 border-b border-white/5 lg:border-transparent">
            {/* Hamburger (Mobile Only) */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="h-6 w-6" />
            </button>

            {/* Title */}
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">Dashboard</h1>
            
            <div className="flex items-center gap-5">
              {/* <button className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/80 relative shadow-sm hover:shadow-md hover:border-border backdrop-blur-sm">
                 <Bell className="h-[18px] w-[18px]" />
                 <span className="absolute top-[9px] right-[10px] h-[5px] w-[5px] rounded-full bg-primary shadow-[0_0_5px_var(--primary)]"></span>
              </button> */}
              {/* <div className="flex items-center gap-2.5 bg-muted/60 border border-border/80 pl-4 py-1.5 pr-1.5 rounded-full cursor-pointer hover:bg-muted transition-colors shadow-sm hover:shadow-md backdrop-blur-sm">
                 <span className="text-sm font-medium hidden sm:block text-foreground/90">Main Account</span>
                 <ChevronDown className="h-[14px] w-[14px] text-muted-foreground hidden sm:block mr-1" />
                 <div className="h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center text-foreground shrink-0 shadow-sm">
                    <User className="h-[14px] w-[14px] opacity-70" />
                 </div>
              </div> */}
            </div>
         </header>

         {/* Scrollable Layout */}
         <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 pt-4 space-y-7 no-scrollbar relative">
            
            {/* PREFERRED STOCK CHARTS (Switchable) */}
            <div className="space-y-4">
               <div className="flex items-center gap-2 flex-wrap pb-1">
                  {PREFERRED_STOCKS.map((stock) => (
                    <button
                      key={stock.symbol}
                      onClick={() => setActiveStock(stock)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                        activeStock.symbol === stock.symbol 
                        ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px] shadow-primary/20" 
                        : "glass-button-premium text-muted-foreground border-white/10 hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {stock.name} ({stock.symbol.split('-')[0]})
                    </button>
                  ))}
               </div>
               
               <div className="h-[400px] sm:h-[450px]">
                 <YahooChartPanel
                   symbol={activeStock.symbol}
                   displayName={activeStock.name}
                 />
               </div>
            </div>

            {/* UPSELL (If free user) */}
            {!isPremium && (
               <div className="glass-card-premium p-5 flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden shadow-lg shadow-background/20">
                  <div className="absolute inset-0 bg-primary/5 opacity-50"></div>
                  <div className="flex gap-4 relative z-10 w-full sm:w-auto">
                     <div className="p-3 bg-card border border-border/80 rounded-xl shrink-0 shadow-sm h-fit">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                     </div>
                     <div className="pt-0.5">
                        <p className="font-bold text-foreground text-base tracking-tight">Unlock Live Trading</p>
                        <p className="text-[13px] text-muted-foreground/90 mt-1 font-medium leading-relaxed max-w-lg">
                           Connect your broker, place real orders & auto-execute strategies.
                        </p>
                     </div>
                  </div>
                  <Button onClick={() => { window.location.href = '/#pricing'; }} className="shrink-0 w-full sm:w-auto bg-primary text-primary-foreground text-sm px-6 h-11 rounded-xl font-semibold relative z-10 hover:shadow-[0_4px_12px_-4px_var(--primary)] transition-shadow">
                     Upgrade to Pro →
                  </Button>
               </div>
            )}

            {/* SECONDARY ROW (2 Col) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Link to="/predictions" className="block outline-none group">
                  <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-secondary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                     <div className="relative z-[2] flex items-center gap-5">
                        <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm"><Activity className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" /></div>
                        <div>
                           <p className="font-bold text-foreground text-[17px] tracking-tight">Past Analyses</p>
                           <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">Review your complete analysis history and AI performance.</p>
                        </div>
                     </div>
                  </div>
               </Link>
               <Link to="/active-trades?tab=completed" className="block outline-none group">
                  <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                     <div className="relative z-[2] flex items-center gap-5">
                        <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm"><BarChart3 className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" /></div>
                        <div>
                           <p className="font-bold text-foreground text-[17px] tracking-tight">Performance</p>
                           <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">Analyze your trading performance, win rates, and P&L stats.</p>
                        </div>
                     </div>
                  </div>
               </Link>
            </div>

            {/* THIRD ROW (2 Col) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Link to="/news" className="block outline-none group">
                  <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                     <div className="relative z-[2] flex items-center gap-5">
                        <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm"><Newspaper className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" /></div>
                        <div>
                           <p className="font-bold text-foreground text-[17px] tracking-tight">Latest News</p>
                           <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">Get real-time market updates, IPO news, and global signals.</p>
                        </div>
                     </div>
                  </div>
               </Link>
               <Link to="/tick-chart" className="block outline-none group">
                  <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-secondary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                     <div className="relative z-[2] flex items-center gap-5">
                        <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm"><BarChart2 className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" /></div>
                        <div>
                           <p className="font-bold text-foreground text-[17px] tracking-tight">Live Tick Chart</p>
                           <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">Monitor real-time order flow and footprint imbalances.</p>
                        </div>
                     </div>
                  </div>
               </Link>
            </div>

            {/* ALGO TRADE CTA */}
            <div className="bg-gradient-to-r from-card to-trading-dark border border-primary/20 hover:border-primary/40 rounded-2xl p-7 shadow-[0_0_40px] shadow-primary/5 relative overflow-hidden group transition-all duration-500 mt-2">
               <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
               <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex gap-5 w-full md:w-auto">
                     <div className="p-4 bg-card border border-border/80 rounded-2xl shrink-0 h-fit shadow-lg shadow-background/50 group-hover:border-primary/40 transition-colors">
                        <Bot className="h-7 w-7 text-primary" />
                     </div>
                     <div className="pt-0.5">
                        <h2 className="text-[22px] font-bold text-foreground tracking-tight">Algo Trade</h2>
                        <p className="text-[14px] text-muted-foreground mt-1.5 font-medium leading-relaxed max-w-xl">
                           Automate your strategy with AI-powered signals and dynamic risk management rules designed for modern markets.
                        </p>
                     </div>
                  </div>
                  <Link to="/algo-setup" className="shrink-0 w-full md:w-auto flex justify-center bg-primary text-primary-foreground px-8 h-[52px] items-center rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-[0_4px_16px_-4px_var(--primary)] group-hover:shadow-[0_8px_24px_-6px_var(--primary)] text-base glass-button-premium border-white/20">
                     Get Started &rarr;
                  </Link>
               </div>
            </div>

            {/* PLATFORM CAPABILITIES */}
            <div className="pt-2">
               <h3 className="text-xl font-bold text-foreground mb-5 tracking-tight px-1">Platform Capabilities</h3>
               <div className="glass-card-premium p-6 lg:p-8 shadow-md shadow-background/10 bg-gradient-to-tr from-transparent via-transparent to-primary/15">
                  <div className="relative z-[2] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 xl:gap-6">
                     <div className="space-y-4">
                        <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                           <BrainCircuit className="h-[18px] w-[18px]" /> AI Analysis
                        </h4>
                        <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Probability-based scoring</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Multi-timeframe forecasts</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Sentiment & news logic</li>
                        </ul>
                     </div>
                     <div className="space-y-4">
                        <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                           <Activity className="h-[18px] w-[18px]" /> Trade Tracking
                        </h4>
                        <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Real-time P&L calculations</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Automatic price updates</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Smart notifications</li>
                        </ul>
                     </div>
                     <div className="space-y-4">
                        <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                           <ShieldCheck className="h-[18px] w-[18px]" /> Risk Management
                        </h4>
                        <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Auto stop-loss & take-profit</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Position sizing calculator</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Risk-adjusted alerts</li>
                        </ul>
                     </div>
                     <div className="space-y-4">
                        <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                           <KeyRound className="h-[18px] w-[18px]" /> Personalization
                        </h4>
                        <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Custom trading profiles</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Strategy-based logic</li>
                           <li className="flex items-start gap-2.5"><div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div> Market hours detection</li>
                        </ul>
                     </div>
                  </div>
               </div>
            </div>

         </div>
      </main>

      {/* 📰 RIGHT PANEL (Market News - 280px) */}
      <aside className="w-[320px] shrink-0 border-l border-sidebar-border bg-sidebar h-full hidden 2xl:flex flex-col p-6 z-20">
         <div className="flex items-center gap-2 mb-8">
            <h3 className="font-bold text-foreground text-sm tracking-widest uppercase opacity-90">Market News</h3>
            <span className="w-2 h-2 rounded-full bg-trading-green animate-pulse shadow-[0_0_8px] shadow-trading-green relative top-[0.5px]"></span>
         </div>
         <div className="flex-1 overflow-y-auto no-scrollbar space-y-5">
            {newsLoading ? (
               // Array of 5 Skeleton Loaders representing live news updates
               [1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4 pb-5 border-b border-border/50 last:border-0 relative">
                     <div className="h-16 w-16 bg-muted/60 rounded-xl shrink-0 animate-pulse"></div>
                     <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-full bg-muted/60 rounded-[4px] animate-pulse"></div>
                        <div className="h-3.5 w-[85%] bg-muted/60 rounded-[4px] animate-pulse"></div>
                        <div className="h-3 w-1/2 bg-muted/40 rounded-[4px] mt-2 animate-pulse"></div>
                     </div>
                  </div>
               ))
            ) : (
               <>
                 {news.map((item) => (
                    <a 
                      key={item.id} 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex gap-4 pb-5 border-b border-primary/25 last:border-0 group hover:opacity-90 transition-opacity"
                    >
                       <div className="h-16 w-16 rounded-xl bg-muted/30 shrink-0 overflow-hidden border border-border/50">
                          {item.image_url ? (
                             <img src={item.image_url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                          ) : (
                             <div className="h-full w-full flex items-center justify-center text-muted-foreground/30"><Newspaper className="h-6 w-6" /></div>
                          )}
                       </div>
                       <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h4 className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
                             {item.title}
                          </h4>
                          <p className="text-[11px] font-medium text-muted-foreground/80 truncate">
                             {item.source} <span className="mx-0.5 opacity-50">•</span> {formatDistanceToNow(new Date(item.published_at), { addSuffix: true }).replace('about ', '')}
                          </p>
                        </div>
                     </a>
                 ))}
                 <Link to="/news" className="block w-full text-center py-2.5 mt-2 rounded-[10px] glass-button-premium border-white/10 text-[13px] font-semibold text-foreground/80 hover:bg-white/10 hover:text-foreground transition-all">
                   See more
                 </Link>
               </>
            )}
         </div>
      </aside>
      
      {/* 📱 MOBILE SIDEBAR (Off-canvas) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300"
             onClick={closeMobileMenu}
           />
           
           {/* Off-canvas Panel */}
           <aside 
             ref={mobileMenuRef}
             className="absolute inset-y-0 left-0 w-[280px] bg-sidebar border-r border-sidebar-border shadow-2xl flex flex-col h-full"
           >
              {/* Close Button Header */}
              <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
                 <img src={logo} alt="ChartMate" className="h-6 object-contain" />
                 <button onClick={closeMobileMenu} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-6 w-6" />
                 </button>
              </div>

              {/* Navigation (Reused logic) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6 pt-6">
                 <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-widest px-2 mb-3.5 font-semibold opacity-80">Navigation</p>
                    <div className="space-y-2">
                       {navLinks.map((link) => {
                         const Icon = link.icon;
                         const isActive = link.to === "/home";
                         
                         return (
                           <Link 
                             key={link.to} 
                             to={link.to} 
                             onClick={closeMobileMenu}
                             className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                               isActive 
                               ? "bg-sidebar-primary/10 text-primary border-l-[3px] border-primary font-semibold" 
                               : "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-primary/5 border-l-[3px] border-transparent"
                             }`}
                           >
                              <Icon className={`h-4 w-4 ${link.iconColor || ''} ${link.iconOpacity || ''}`} /> {link.label}
                           </Link>
                         );
                       })}
                    </div>
                 </div>
              </div>

              {/* User Footer in Mobile Menu */}
              <div className="p-4 border-t border-sidebar-border pb-8">
                 <div className="flex items-center gap-3 px-2 py-2">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-foreground border border-border shrink-0">
                       <User className="h-5 w-5 opacity-50" />
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className="text-sm font-semibold text-foreground truncate leading-tight">{user?.email?.split('@')[0] || 'User'}</p>
                       <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{user?.email}</p>
                    </div>
                    <button onClick={() => { signOut(); closeMobileMenu(); }} className="text-muted-foreground hover:text-destructive transition-colors px-1">
                       <LogOut className="h-4 w-4" />
                    </button>
                 </div>
              </div>
           </aside>
        </div>
      )}

      {/* Existing Chatbots and Modals */}
      <TradingIntegrationModal
        open={showBrokerModal}
        onOpenChange={setShowBrokerModal}
        onSaved={() => refresh()}
        save={async (params) => save(params)}
      />
      {/* <PredictionChatbot 
        open={showChatbot} 
        setOpen={setShowChatbot} 
      /> */}
    </div>
  );
}
