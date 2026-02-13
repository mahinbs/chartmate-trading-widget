import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface FAQItemProps {
    question: string;
    answer: string;
    isOpen: boolean;
    onClick: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onClick }) => {
    return (
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden mb-4 transition-all hover:shadow-md">
            <button
                className="w-full px-6 py-5 flex justify-between items-center text-left focus:outline-none bg-white hover:bg-gray-50 transition-colors"
                onClick={onClick}
            >
                <span className="text-lg font-bold text-heading pr-8 flex items-center">
                    <HelpCircle className="w-5 h-5 text-primary mr-3 opacity-50" />
                    {question}
                </span>
                <span className={`transform transition-transform duration-300 text-gray-400 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                    <ChevronDown className="w-5 h-5" />
                </span>
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div className="px-6 pb-6 pt-2 pl-14 text-gray-600 leading-relaxed text-base">
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
            question: "How accurate are the AI predictions?",
            answer: "Our models utilize advanced machine learning algorithms trained on decades of market data. While no system can guarantee 100% accuracy, ChartMate AI consistently maintains a 70-80% success rate on high-confidence setups."
        },
        {
            question: "Do you execute trades for me?",
            answer: "No, ChartMate AI is an intelligence tool, not an auto-trader. We provide the signals, analysis, and risk parameters, but you retain full control over your execution and funds."
        },
        {
            question: "What markets are supported?",
            answer: "We support over 150 assets including major Forex pairs (EUR/USD, GBP/JPY), global equities (US Stocks), and top cryptocurrencies (BTC, ETH, SOL)."
        },
        {
            question: "Is there a free trial?",
            answer: "Yes! You can access our 'Basic' analysis tier for free forever. For advanced multi-horizon forecasts and real-time alerts, we offer a 14-day free trial of our Pro plan."
        },
        {
            question: "Is this suitable for beginners?",
            answer: "Absolutely. We simplify complex market data into clear, actionable insights (Buy/Sell zones). You don't need to be an expert technical analyst to benefit from our risk management features."
        }
    ];

    const handleToggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section id="faq" className="py-24 bg-gray-50">
            <div className="container-custom max-w-4xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading text-heading mb-4">
                        Frequently Asked Questions
                    </h2>
                    <p className="text-gray-600">
                        Everything you need to know about trading with ChartMate AI.
                    </p>
                </div>

                <div>
                    {faqs.map((faq, index) => (
                        <FAQItem
                            key={index}
                            question={faq.question}
                            answer={faq.answer}
                            isOpen={openIndex === index}
                            onClick={() => handleToggle(index)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
