import React from 'react';
import { Check } from 'lucide-react';

const Pricing = () => {
    const resaleItems = [
        { name: "Enterprise Master License", price: "$9,999 (One-Time)", fee: "0%", note: "Serious businesses / large operators" },
        { name: "1 Year License", price: "$1,499", fee: "0%", note: "Professional sellers" },
        { name: "2 Year License", price: "$2,499", fee: "0%", note: "Growth-focused operators" },
        { name: "5 Year License", price: "$4,999", fee: "0%", note: "Most popular / best ROI" },
        { name: "Subscription (Monthly)", price: "$99 / Month", fee: "30%", note: "Low-risk entry", isSubscription: true },
        { name: "Subscription (Quarterly)", price: "$249 / Quarter", fee: "30%", note: "Better cash flow", isSubscription: true },
        { name: "Subscription (Annual)", price: "$899 / Year", fee: "30%", note: "Best subscription value", isSubscription: true },
    ];

    return (
        <section id="pricing" className="py-24 bg-[#f9f7f6]">
            <div className="container-custom">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading mb-6 tracking-tight">
                        Simple, Transparent Pricing
                    </h2>
                    <p className="text-xl text-gray-600">
                        Choose the plan that fits your business model. Whether you want to use it yourself or build a business around it.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">
                    {/* Enterprise Master License Plan */}
                    {/* <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-gray-100 flex flex-col h-full">
                        <div className="mb-8">
                            <h3 className="text-2xl font-bold text-heading mb-2">Enterprise Master License</h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold text-primary">$499</span>
                                <span className="text-gray-500 font-medium">/ yearly</span>
                            </div>
                            <p className="text-gray-500 mt-4">For trading firms and educators who want to use the tool internally.</p>
                        </div>

                        <ul className="space-y-4 mb-8 flex-grow">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                                <span className="text-gray-600">Full access to Chartmate platform</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                                <span className="text-gray-600">Lifetime updates & support</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
                                    <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </div>
                                <span className="text-gray-600">No resale rights included</span>
                            </li>
                        </ul>

                        <a href="#contact" className="w-full block text-center bg-gray-100 hover:bg-gray-200 text-heading font-bold py-4 rounded-xl transition-colors">
                            Get Partnership
                        </a>
                    </div> */}

                    {/* White Label SaaS Plans */}
                    {[
                        {
                            name: "1 Year License",
                            price: "$999",
                            originalPrice: "$1,499",
                            duration: "/ 1 year",
                            badge: "Standard",
                            badgeColor: "bg-gray-700",
                            isRecommended: false
                        },
                        {
                            name: "2 Year License",
                            price: "$1,999",
                            originalPrice: "$2,499",
                            duration: "/ 2 years",
                            badge: "Popular",
                            badgeColor: "bg-blue-600",
                            isRecommended: false
                        },
                        {
                            name: "5 Year License",
                            price: "$3,399",
                            originalPrice: "$4,999",
                            duration: "/ 5 years",
                            badge: "Best Value",
                            badgeColor: "bg-primary",
                            isRecommended: true
                        }
                    ].map((plan, index) => (
                        <div key={index} className={`bg-[#181B22] rounded-2xl p-6 md:p-8 shadow-xl border border-gray-800 flex flex-col h-full relative overflow-hidden group ${plan.isRecommended ? 'ring-2 ring-primary' : ''}`}>
                            {/* Highlight Effect */}
                            <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                                <svg className="w-64 h-64 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
                            </div>

                            <div className="mb-8 relative z-10 text-center">
                                <div className={`inline-block ${plan.badgeColor} text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider`}>
                                    {plan.badge}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-gray-500 line-through text-lg">{plan.originalPrice}</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold text-white">{plan.price}</span>
                                        <span className="text-gray-400 font-medium text-sm">{plan.duration}</span>
                                    </div>
                                </div>
                                <p className="text-gray-400 mt-4 text-sm">Start your own software business. Sell licenses and keep the profits.</p>
                            </div>

                            <div className="space-y-6 mb-8 flex-grow relative z-10">

                                {/* What Users Receive */}
                                <div className="space-y-3">
                                    <h4 className="text-white font-bold text-xs uppercase tracking-wider border-b border-gray-700 pb-2">Includes</h4>
                                    <ul className="space-y-2">
                                        {[
                                            "Your own branded trading software",
                                            "Deployment on your own domain",
                                            "Fully designed landing page",
                                            "Client login dashboard",
                                            "Admin panel to manage users",
                                            "Annual license system ($99/year model)",
                                            "Multi-factor trade analysis engine",
                                            "Risk–reward calculator",
                                            "Strategy builder panel",
                                            "Trade performance tracking",
                                            "Basic backtesting module",
                                            "Optional strategy automation"
                                        ].map((item, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-1" />
                                                <span className="text-gray-300 text-xs">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* What You Control */}
                                <div className="space-y-3">
                                    <h4 className="text-white font-bold text-xs uppercase tracking-wider border-b border-gray-700 pb-2">You Control</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            "Your brand name",
                                            "Your domain",
                                            "Your pricing",
                                            "Your marketing",
                                            "Your customers",
                                            "Your revenue"
                                        ].map((item, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"></div>
                                                <span className="text-gray-300 text-[10px]">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Revenue Model */}
                                <div className="bg-[#252a33] rounded-xl p-3 border border-gray-700">
                                    <h4 className="text-primary font-bold text-xs uppercase tracking-wider mb-2">Revenue Model</h4>
                                    <ul className="space-y-1">
                                        <li className="flex justify-between text-xs">
                                            <span className="text-gray-300">License Sales</span>
                                            <span className="text-white font-medium">$99/year+</span>
                                        </li>
                                        <li className="flex justify-between text-xs">
                                            <span className="text-gray-300">Your Share</span>
                                            <span className="text-green-400 font-bold">70%</span>
                                        </li>
                                        <li className="flex justify-between text-xs">
                                            <span className="text-gray-300">Platform Share</span>
                                            <span className="text-gray-400">30%</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <a href="#contact" className={`w-full block text-center ${plan.isRecommended ? 'bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20' : 'bg-gray-700 hover:bg-gray-600 text-white'} font-bold py-3 rounded-xl transition-colors relative z-10 text-sm`}>
                                Get {plan.name}
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Pricing;
