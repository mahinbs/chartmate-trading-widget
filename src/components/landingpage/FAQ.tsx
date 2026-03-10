import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

interface FAQItemProps {
    question: string;
    answer: string;
    isOpen: boolean;
    onClick: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onClick }) => {
    return (
        <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden mb-4 transition-all hover:border-cyan-500/30">
            <button
                className="w-full px-6 py-6 flex justify-between items-center text-left focus:outline-none bg-transparent hover:bg-white/5 transition-colors"
                onClick={onClick}
            >
                <span className="text-lg font-bold text-white pr-8 flex items-center">
                    <HelpCircle className="w-5 h-5 text-cyan-500 mr-4 opacity-70" />
                    {question}
                </span>
                <span className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-gray-500'}`}>
                    <ChevronDown className="w-5 h-5" />
                </span>
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="px-6 pb-6 pt-0 pl-14 text-gray-400 font-light leading-relaxed text-base">
                    {answer}
                </div>
            </div>
        </div>
    );
};

const FAQ = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs = [
        {
            question: "How accurate is the AI probability analysis?",
            answer: "Our models utilize advanced machine learning algorithms trained on decades of market data. While no system can guarantee 100% accuracy, our ai probability software AI consistently maintains a 70-80% success rate on high-confidence setups."
        },
        {
            question: "Do you execute trades for me?",
            answer: "No, our ai probability software is an intelligence tool, not an auto-trader. We provide probability analysis and risk parameters."
        },
        {
            question: "What markets are supported?",
            answer: "We support over 150 assets including major Forex pairs (EUR/USD, GBP/JPY), global equities (US Stocks), and top cryptocurrencies (BTC, ETH, SOL)."
        },
        {
            question: "Is there a free trial?",
            answer: "Yes! We offer a 7-day free trial with full access to all features. After the trial period, your selected subscription plan will begin."
        },
    ];

    const handleToggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section id="faq" className="py-16 bg-zinc-950 relative">
            <div className="container mx-auto px-4 max-w-4xl relative z-10">
                <ScrollReveal>
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                            Frequently Asked <span className="text-primary">Questions</span>
                        </h2>
                        <p className="text-xl text-gray-400 font-light">
                            Everything you need to know about trading with our ai probability software AI.
                        </p>
                    </div>
                </ScrollReveal>

                <div>
                    {faqs.map((faq, index) => (
                        <ScrollReveal key={index} delay={0.1 * index} direction="up">
                            <FAQItem
                                question={faq.question}
                                answer={faq.answer}
                                isOpen={openIndex === index}
                                onClick={() => handleToggle(index)}
                            />
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
