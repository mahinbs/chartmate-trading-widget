import React from 'react';
import { Target, Clock, BarChart2, Shield } from 'lucide-react';

const features = [
    {
        icon: <Target className="w-8 h-8 text-primary" />,
        title: "Multi-Horizon Forecasts",
        description: "AI-driven probability analysis for 15m, 1h, and 1d timeframes to guide your strategy."
    },
    {
        icon: <Clock className="w-8 h-8 text-primary" />,
        title: "Intraday Intelligence",
        description: "Real-time hourly breakdowns, volume profiles, and momentum indicators."
    },
    {
        icon: <BarChart2 className="w-8 h-8 text-primary" />,
        title: "Smart Trade Tracking",
        description: "Automated P&L tracking with real-time alerts and performance analytics."
    },
    {
        icon: <Shield className="w-8 h-8 text-primary" />,
        title: "Personalized Risk",
        description: "Custom risk settings and stop-loss recommendations tailored to your profile."
    }
];

const Services = () => {
    return (
        <section id="features" className="py-24 bg-gray-50">
            <div className="container-custom">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading text-heading mb-4">
                        Powerful Trading Features
                    </h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        ChartMate AI gives you the professional edge with advanced analytics and automated risk management.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                            <div className="mb-4 bg-primary/10 w-16 h-16 rounded-lg flex items-center justify-center">
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-heading">{feature.title}</h3>
                            <p className="text-gray-600 leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
