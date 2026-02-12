import React, { useState } from 'react';

interface FAQItemProps {
    question: string;
    answer: string;
    isOpen: boolean;
    onClick: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onClick }) => {
    return (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4 transition-shadow hover:shadow-md">
            <button
                className="w-full px-4 py-4 flex justify-between items-center text-left focus:outline-none"
                onClick={onClick}
            >
                <span className="text-xl font-medium text-heading pr-8">{question}</span>
                <span className={`transform transition-transform duration-300 text-heading ${isOpen ? 'rotate-45' : 'rotate-0'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </span>
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div className="px-8 pb-8 text-gray-600 leading-relaxed text-base">
                    {answer}
                </div>
            </div>
        </div>
    );
};

const FAQ = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs = [
        {
            question: "What technologies does The Gnar specialize in?",
            answer: "We specialize in modern web and mobile technologies including React, React Native, Ruby on Rails, Node.js, and Python. We choose the right tools for the job to ensure scalability, performance, and maintainability."
        },
        {
            question: "How long does it typically take to build a product?",
            answer: "Timeline varies based on complexity, but our rapid delivery model typically gets an MVP to market in 3-4 months. We work in agile sprints to deliver value incrementally and adapt to feedback."
        },
        {
            question: "How does The Gnar handle project billing and budgets?",
            answer: "We work on a time and materials basis or fixed-bid depending on the project scope. We provide transparent weekly reports so you always know where your budget is going and can make informed decisions."
        },
        {
            question: "What makes The Gnar different from other software consultancies?",
            answer: "Our 'Founders Mindset' approach means we treat your business like our own. We combine senior-level engineering talent with strategic product thinking to build solutions that actually solve business problems."
        },
        {
            question: "How does The Gnar's Bug-Free Warranty work?",
            answer: "We stand behind our code. If you find a bug in any code we've released to production, we'll fix it for free for up to one year after launch. It's our commitment to quality."
        },
        {
            question: "Can The Gnar integrate with our existing team?",
            answer: "Absolutely. We often work as an extension of existing engineering teams, providing specialized expertise, increasing velocity, and helping to mentor junior developers."
        },
        {
            question: "What happens after the initial product launch?",
            answer: "We don't just launch and leave. We offer ongoing support, maintenance, and feature development packages to ensure your product continues to evolve and perform as your user base grows."
        }
    ];

    const handleToggle = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section className="py-24 bg-[#f9f7f6]">
            <div className="container-custom max-w-4xl mx-auto">
                <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading text-center mb-12 text-[#181B22]">
                    Frequently Asked Questions
                </h2>

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
