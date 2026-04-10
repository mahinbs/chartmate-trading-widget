import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { BarChart3, FlaskConical, Rocket } from 'lucide-react';

const InsideTheSoftware = () => {
    return (
        <section className="py-24 bg-black relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-5xl font-bold mb-16 text-center text-white tracking-tight">
                        What Your Clients <span className="text-primary">Get</span>
                    </h2>
                </ScrollReveal>

                <div className="grid lg:grid-cols-3 gap-8">
                    {[
                        {
                            title: "01 - AI Trading Analysis",
                            desc: "Multi-strategy signal scoring on any stock. 7-factor validation engine covers market context, trend, signal strength, volume, volatility, risk-reward, and trap detection. Every entry gets a score, a grade, and a plain English reason.",
                            icon: <BarChart3 className="w-6 h-6 text-primary" />
                        },
                        {
                            title: "02 - Backtesting with AI Review",
                            desc: "Per-trade drill-down with entry price, exit price, indicator values at entry, and similar historical patterns. AI summary explains why the strategy worked or failed so users can verify the logic before risking capital.",
                            icon: <FlaskConical className="w-6 h-6 text-purple-400" />
                        },
                        {
                            title: "03 - Live Algo Deployment",
                            desc: "Strategy is coded by our engineers, AI validation is added, and it goes live on the client's broker within 72 hours. Full dashboard includes positions, orders, armed strategies, and a kill switch.",
                            icon: <Rocket className="w-6 h-6 text-green-400" />
                        }
                    ].map((feature, index) => (
                        <ScrollReveal key={index} delay={index * 0.1} direction="up">
                            <div className="h-full p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all hover:bg-white/10 group">
                                <div className="p-3 bg-black rounded-xl border border-white/10 group-hover:border-cyan-500/30 transition-colors w-fit mb-6">
                                    {feature.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-primary transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-400 leading-relaxed">
                                    {feature.desc}
                                </p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default InsideTheSoftware;
