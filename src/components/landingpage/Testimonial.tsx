import React from 'react';
import { Star } from 'lucide-react';

const testimonials = [
    {
        quote: "I used to overtrade and lose money. ChartMate's risk settings forced me to be disciplined. My P&L has never looked better.",
        author: "Alex T.",
        role: "Day Trader"
    },
    {
        quote: "The detailed 15-minute forecasts are scary accurate. It's like having a cheat sheet for the market.",
        author: "Sarah L.",
        role: "Crypto Investor"
    },
    {
        quote: "Finally, a tool that doesn't just give buy signals but tells you WHEN to get out. The exit timing analysis saved my portfolio twice.",
        author: "Michael R.",
        role: "Forex Trader"
    }
];

const Testimonial = () => {
    return (
        <section id="testimonials" className="py-24 bg-gray-50">
            <div className="container-custom">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading text-heading mb-4">
                        Trusted by Smart Traders
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {testimonials.map((item, index) => (
                        <div key={index} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
                            <div className="flex space-x-1 mb-6">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                                ))}
                            </div>
                            <p className="text-gray-600 text-lg italic mb-6 leading-relaxed">
                                "{item.quote}"
                            </p>
                            <div>
                                <h4 className="font-bold text-heading">{item.author}</h4>
                                <span className="text-sm text-gray-500">{item.role}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Testimonial;
