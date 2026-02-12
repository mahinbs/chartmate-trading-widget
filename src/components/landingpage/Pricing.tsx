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

                <div className="grid lg:grid-cols-2 gap-8 items-start max-w-6xl mx-auto">
                    {/* Partnership Plan */}
                    <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-gray-100 flex flex-col h-full">
                        <div className="mb-8">
                            <h3 className="text-2xl font-bold text-heading mb-2">Partnership</h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold text-primary">$499</span>
                                <span className="text-gray-500 font-medium">/ one-time</span>
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
                    </div>

                    {/* White Label SaaS Plan */}
                    <div className="bg-[#181B22] rounded-2xl p-8 md:p-12 shadow-xl border border-gray-800 flex flex-col h-full relative overflow-hidden group">
                        {/* Highlight Effect */}
                        <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                            <svg className="w-64 h-64 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
                        </div>

                        <div className="mb-8 relative z-10">
                            <div className="inline-block bg-primary text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
                                Recommended
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">White Label SaaS</h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold text-white">$999</span>
                                <span className="text-gray-400 font-medium">/ one-time</span>
                            </div>
                            <p className="text-gray-400 mt-4">Start your own software business. Sell licenses and keep the profits.</p>
                        </div>

                        <div className="space-y-4 mb-8 flex-grow relative z-10">
                            <div className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                                <span className="text-gray-300"><strong>Full Resale Rights</strong> - Sell Key to others</span>
                            </div>

                            {/* Resale Table */}
                            <div className="mt-6 bg-[#252a33] rounded-xl overflow-hidden border border-gray-700">
                                <div className="px-4 py-3 bg-[#2d333f] border-b border-gray-700 flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Your Revenue Potential</span>
                                    <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">Platform Fees</span>
                                </div>
                                <div className="divide-y divide-gray-700/50">
                                    {resaleItems.map((item, index) => (
                                        <div key={index} className="p-3 text-sm grid grid-cols-[1.5fr,1fr,0.5fr] gap-2 items-center hover:bg-white/5 transition-colors">
                                            <div>
                                                <div className="text-white font-medium">{item.name}</div>
                                                <div className="text-gray-500 text-xs mt-0.5">{item.note}</div>
                                            </div>
                                            <div className="text-right px-2">
                                                <div className="text-white font-mono">{item.price}</div>
                                                {item.isSubscription && <div className="text-xs text-primary mt-0.5">Recurring</div>}
                                            </div>
                                            <div className="text-right">
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${item.fee === "0%" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                                                    {item.fee}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-[#22262e] border-t border-gray-700 text-xs text-gray-400 italic text-center">
                                    * We take a 30% commission only on recurring subscription sales.
                                </div>
                            </div>
                        </div>

                        <a href="#contact" className="w-full block text-center bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-xl transition-colors relative z-10 shadow-lg shadow-primary/20">
                            Get White Label SaaS
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Pricing;
