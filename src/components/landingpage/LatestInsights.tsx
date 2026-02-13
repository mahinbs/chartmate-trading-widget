import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

const LatestInsights = () => {
    const insights = [
        {
            id: 1,
            category: "Crypto Analysis",
            title: "Bitcoin (BTC) Approaching Key Resistance at $68k",
            description: "Volume profile suggests a breakout is imminent. Our AI indicates a 78% probability of a push to $72k within the next 48 hours.",
            image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1000&auto=format&fit=crop",
            sentiment: "Bullish",
            icon: <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
        },
        {
            id: 2,
            category: "Equities",
            title: "NVIDIA (NVDA) Overextended on Daily RSI",
            description: "RSI divergence on the 4h and Daily charts points to a potential pullback. Risk/Reward ratio for long positions is currently unfavorable.",
            image: "https://images.unsplash.com/photo-1591696205602-2f950c417cb9?q=80&w=1000&auto=format&fit=crop",
            sentiment: "Bearish",
            icon: <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
        },
        {
            id: 3,
            category: "Forex",
            title: "EUR/USD Liquidity Sweep Completed",
            description: "The pair has swept sell-side liquidity below 1.0800. Watch for a reversal pattern on the 15m timeframe to target 1.0950.",
            image: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=1000",
            sentiment: "Neutral/Bullish",
            icon: <Activity className="w-4 h-4 text-blue-500 mr-1" />
        }
    ];

    return (
        <section id="insights" className="py-24 bg-gray-50">
            <div className="container-custom">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading text-heading">
                        Recent Market Analysis
                    </h2>
                    <Link to="/intraday" className="hidden md:inline-flex items-center justify-center border border-primary text-primary font-bold py-4 px-8 rounded-lg hover:bg-primary hover:text-white transition-colors text-base">
                        View All Analysis
                    </Link>
                </div>

                {/* Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {insights.map((insight) => (
                        <div key={insight.id} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 bg-white flex flex-col h-full group hover:-translate-y-1">

                            <div className="relative h-48 overflow-hidden">
                                <img src={insight.image} alt={insight.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider text-heading shadow-sm">
                                    {insight.category}
                                </div>
                            </div>

                            <div className="p-8 flex-grow flex flex-col">
                                <div className="flex items-center mb-4">
                                    {insight.icon}
                                    <span className={`text-sm font-bold ${insight.sentiment === 'Bearish' ? 'text-red-500' : insight.sentiment === 'Bullish' ? 'text-green-500' : 'text-blue-500'}`}>
                                        {insight.sentiment}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold font-heading text-heading mb-4 leading-tight group-hover:text-primary transition-colors">
                                    {insight.title}
                                </h3>
                                <p className="text-gray-500 text-base leading-relaxed mb-6 flex-grow">
                                    {insight.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Mobile Button */}
                <div className="mt-12 md:hidden text-center">
                    <Link to="/intraday" className="inline-block border border-primary text-primary font-bold py-3 px-6 rounded-lg hover:bg-primary hover:text-white transition-colors">
                        View All Analysis
                    </Link>
                </div>

            </div>
        </section>
    );
};

export default LatestInsights;
