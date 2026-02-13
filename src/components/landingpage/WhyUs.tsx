import React from 'react';
import { Brain, Zap, UserCheck } from 'lucide-react';

const reasons = [
    {
        icon: <Brain className="w-12 h-12 text-primary mb-6" />,
        title: "Gemini-Powered Intelligence",
        description: "Leveraging Google's most advanced AI models to process millions of market data points in seconds, identifying patterns invisible to the human eye."
    },
    {
        icon: <Zap className="w-12 h-12 text-primary mb-6" />,
        title: "Real-Time Execution Speed",
        description: "Markets move fast. Our low-latency analysis ensures you get trade setups the moment opportunities arise, not minutes later."
    },
    {
        icon: <UserCheck className="w-12 h-12 text-primary mb-6" />,
        title: "Personalized For You",
        description: "Your risk tolerance, your capital, your goals. ChartMate AI adapts its recommendations to fit your specific trading profile."
    }
];

const WhyUs = () => {
    return (
        <section className="py-24 bg-white relative overflow-hidden">
            {/* Grid Background */}
            <div className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(to right, #f9f9f9 1px, transparent 1px),
            linear-gradient(to bottom, #f9f9f9 1px, transparent 1px)
          `,
                    backgroundSize: '80px 80px'
                }}
            ></div>

            <div className="container-custom relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <h2 className="text-4xl md:text-5xl font-bold font-heading text-heading mb-6 tracking-tight">
                        Why Choose ChartMate AI?
                    </h2>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        Manual trading is exhausting and error-prone. Upgrade to an intelligent system that never sleeps, never panics, and always follows the data.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {reasons.map((reason, index) => (
                        <div key={index} className="bg-white p-10 rounded-2xl shadow-lg border border-gray-100 hover:-translate-y-2 transition-transform duration-300">
                            {reason.icon}
                            <h3 className="text-2xl font-bold font-heading text-heading mb-4">
                                {reason.title}
                            </h3>
                            <p className="text-gray-600 leading-relaxed">
                                {reason.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Bottom Callout */}
                <div className="mt-20 text-center">
                    <div className="inline-block bg-[#181b22] rounded-full px-8 py-4 text-white shadow-xl">
                        <span className="font-bold text-primary mr-2">94%</span>
                        of users report improved risk management within their first month.
                    </div>
                </div>
            </div>
        </section>
    );
};

export default WhyUs;
