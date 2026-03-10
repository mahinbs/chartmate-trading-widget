import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const LatestInsights = () => {
    const insights = [
        {
            id: 1,
            category: "Crypto Analysis",
            title: "Bitcoin (BTC) Approaching Key Resistance at $68k",
            description: "Volume profile suggests a breakout is imminent. Our AI indicates a 78% probability of a push to $72k within the next 48 hours.",
            image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1000&auto=format&fit=crop",
            sentiment: "Bullish",
            icon: <TrendingUp className="w-4 h-4 text-green-500 mr-2" />
        },
        {
            id: 2,
            category: "Equities",
            title: "NVIDIA (NVDA) Overextended on Daily RSI",
            description: "RSI divergence on the 4h and Daily charts points to a potential pullback. Risk/Reward ratio for long positions is currently unfavorable.",
            image: "https://images.unsplash.com/photo-1591696205602-2f950c417cb9?q=80&w=1000&auto=format&fit=crop",
            sentiment: "Bearish",
            icon: <TrendingDown className="w-4 h-4 text-red-500 mr-2" />
        },
        {
            id: 3,
            category: "Forex",
            title: "EUR/USD Liquidity Sweep Completed",
            description: "The pair has swept sell-side liquidity below 1.0800. Watch for a reversal pattern on the 15m timeframe to target 1.0950.",
            image: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=1000",
            sentiment: "Neutral/Bullish",
            icon: <Activity className="w-4 h-4 text-primary mr-2" />
        }
    ];

    return (
        <section id="insights" className="py-16 bg-black relative">
            <div className="container mx-auto px-4 relative z-10">

                {/* Header */}
                <ScrollReveal>
                    <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/10 pb-6">
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                            Recent Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Analysis</span>
                        </h2>
                        <Link to="/contact-us" className="hidden md:inline-flex items-center justify-center border border-cyan-500/50 text-primary font-bold py-3 px-8 rounded-full hover:bg-cyan-500 hover:text-black transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.3)] text-base">
                            View All Analysis
                        </Link>
                    </div>
                </ScrollReveal>

                {/* Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {insights.map((insight, index) => (
                        <ScrollReveal key={insight.id} delay={index * 0.15} direction="up">
                            <div className="border border-white/10 rounded-3xl overflow-hidden hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] transition-all duration-300 bg-zinc-900/50 flex flex-col h-full group hover:-translate-y-2 backdrop-blur-sm">

                                <div className="relative h-56 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent z-10"></div>
                                    <img src={insight.image} alt={insight.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white border border-white/10 z-20">
                                        {insight.category}
                                    </div>
                                </div>

                                <div className="p-8 flex-grow flex flex-col relative z-20 -mt-6">
                                    <div className="flex items-center mb-4 bg-black/50 w-fit px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md">
                                        {insight.icon}
                                        <span className={`text-xs font-bold uppercase tracking-wider ${insight.sentiment === 'Bearish' ? 'text-red-500' : insight.sentiment === 'Bullish' ? 'text-green-500' : 'text-primary'}`}>
                                            {insight.sentiment}
                                        </span>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-4 leading-tight group-hover:text-primary transition-colors">
                                        {insight.title}
                                    </h3>
                                    <p className="text-gray-400 text-sm leading-relaxed mb-6 flex-grow font-light">
                                        {insight.description}
                                    </p>
                                </div>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>

                {/* Mobile Button */}
                <div className="mt-12 md:hidden text-center">
                    <Link to="/intraday" className="inline-block border border-cyan-500/50 text-primary font-bold py-3 px-8 rounded-full hover:bg-cyan-500 hover:text-black transition-all">
                        View All Analysis
                    </Link>
                </div>

            </div>
        </section>
    );
};

export default LatestInsights;
