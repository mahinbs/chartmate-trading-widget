import React from 'react';
import { Brain, Zap, UserCheck } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

const reasons = [
    {
        icon: <Brain className="w-12 h-12 text-purple-400 mb-6" />,
        title: "AI-Powered Intelligence",
        description: "Leveraging advanced AI to process millions of market data points in seconds, uncovering patterns invisible to human analysis.",
        bg: "bg-secondary/10",
        border: "border-secondary/30",
        shadow: "shadow-[0_0_30px_rgba(168,85,247,0.2)]"
    },
    {
        icon: <Zap className="w-12 h-12 text-primary mb-6" />,
        title: "Real-Time Execution Speed",
        description: "Markets move fast. Our low-latency analysis ensures you get trade setups the moment opportunities arise, not minutes later.",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/30",
        shadow: "shadow-[0_0_30px_rgba(34,211,238,0.2)]"
    },
    {
        icon: <UserCheck className="w-12 h-12 text-blue-400 mb-6" />,
        title: "Personalized For You",
        description: "Your risk tolerance, your capital, your goals. our ai probability software  adapts its recommendations to fit your specific trading profile.",
        bg: "bg-primary/10",
        border: "border-primary/30",
        shadow: "shadow-[0_0_30px_rgba(59,130,246,0.2)]"
    }
];

const WhyUs = () => {
    return (
        <section className="py-16 bg-zinc-950 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/10 to-black pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">
                            Why Choose <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">our ai probability software AI?</span>
                        </h2>
                        <p className="text-xl text-gray-400 leading-relaxed font-light">
                            Manual trading is exhausting and error-prone. Upgrade to an intelligent system that never sleeps, never panics, and always follows the data.
                        </p>
                    </div>
                </ScrollReveal>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {reasons.map((reason, index) => (
                        <ScrollReveal key={index} delay={index * 0.2} direction="up">
                            <div className={`bg-black/50 p-10 rounded-3xl border ${reason.border} hover:-translate-y-2 transition-all duration-300 ${reason.shadow} backdrop-blur-sm h-full`}>
                                <div className={`inline-block p-4 rounded-2xl ${reason.bg} mb-6`}>
                                    {reason.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4">
                                    {reason.title}
                                </h3>
                                <p className="text-gray-400 leading-relaxed font-light">
                                    {reason.description}
                                </p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>

                {/* Bottom Callout */}
                <ScrollReveal delay={0.8}>
                    <div className="mt-20 text-center">
                        <div className="inline-block bg-zinc-900 border border-white/10 rounded-full px-8 py-5 text-gray-300 shadow-2xl hover:border-cyan-500/50 transition-colors">
                            <span className="font-bold text-primary text-xl mr-3 font-mono">94%</span>
                            of users report improved risk management within their first month.
                        </div>
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default WhyUs;
