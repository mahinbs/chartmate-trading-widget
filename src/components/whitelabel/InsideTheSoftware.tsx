import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { Activity, BarChart2, Zap, AlertTriangle } from 'lucide-react';

const InsideTheSoftware = () => {
    return (
        <section className="py-24 bg-black relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-5xl font-bold mb-16 text-center text-white tracking-tight">
                        Inside the <span className="text-primary">Software</span>
                    </h2>
                </ScrollReveal>

                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    {/* Feature List */}
                    <div className="space-y-8">
                        {[
                            {
                                title: "Probability Score",
                                desc: "Know the math behind every potential move (0–100%).",
                                icon: <Activity className="w-6 h-6 text-primary" />
                            },
                            {
                                title: "Sentiment Meter",
                                desc: "Gauge market fear and greed instantly.",
                                icon: <BarChart2 className="w-6 h-6 text-purple-400" />
                            },
                            {
                                title: "Volatility Alerts",
                                desc: "Avoid chop. Trade only when volume confirms.",
                                icon: <Zap className="w-6 h-6 text-yellow-400" />
                            },
                            {
                                title: "Condition Report",
                                desc: "Autodetect Trending vs Sideways markets.",
                                icon: <AlertTriangle className="w-6 h-6 text-red-400" />
                            }
                        ].map((feature, index) => (
                            <ScrollReveal key={index} delay={index * 0.1} direction="left">
                                <div className="flex items-start gap-6 p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all hover:bg-white/10 group">
                                    <div className="p-3 bg-black rounded-xl border border-white/10 group-hover:border-cyan-500/30 transition-colors">
                                        {feature.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">{feature.title}</h3>
                                        <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
                                    </div>
                                </div>
                            </ScrollReveal>
                        ))}
                    </div>

                    {/* Mock UI */}
                    <ScrollReveal direction="right">
                        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl shadow-cyan-900/20 group hover:border-cyan-500/30 transition-all duration-500">
                            {/* Window Controls */}
                            <div className="h-12 bg-black/50 border-b border-white/5 flex items-center px-6 gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/20"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/20"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/20"></div>
                            </div>

                            {/* Dashboard Content */}
                            <div className="p-8 space-y-8">
                                {/* Header */}
                                <div className="flex justify-between items-center border-b border-white/5 pb-6">
                                    <div>
                                        <h3 className="text-3xl font-black text-white tracking-tight">BTC/USD</h3>
                                        <span className="text-primary font-mono text-sm">15 MINUTES</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-4xl font-bold text-green-400">87%</div>
                                        <div className="text-xs text-green-500/70 font-bold uppercase tracking-widest">Bullish Probability</div>
                                    </div>
                                </div>

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Sentiment</div>
                                        <div className="text-2xl font-bold text-white">Greed 78</div>
                                        <div className="w-full bg-gray-800 h-1 mt-2 rounded-full overflow-hidden">
                                            <div className="bg-green-500 h-full w-[78%]"></div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Trend Strength</div>
                                        <div className="text-2xl font-bold text-primary">STRONG</div>
                                        <div className="flex gap-1 mt-2">
                                            <div className="h-1 w-full bg-cyan-500 rounded-full"></div>
                                            <div className="h-1 w-full bg-cyan-500 rounded-full"></div>
                                            <div className="h-1 w-full bg-cyan-500 rounded-full"></div>
                                            <div className="h-1 w-full bg-gray-800 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Stats */}
                                <div className="grid grid-cols-2 gap-6 pt-2">
                                    <div>
                                        <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Volatility</div>
                                        <div className="text-yellow-400 font-bold">MODERATE</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Entry Zone</div>
                                        <div className="text-white font-mono">67,400 – 67,250</div>
                                    </div>
                                </div>
                            </div>

                            {/* Overlay Reflection */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
                        </div>
                    </ScrollReveal>
                </div>
            </div>
        </section>
    );
};

export default InsideTheSoftware;
