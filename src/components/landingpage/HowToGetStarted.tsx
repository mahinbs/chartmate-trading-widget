import React from 'react';
import { MousePointerClick, Settings, LineChart } from 'lucide-react';
import { Link } from 'react-router-dom';

const HowToGetStarted = () => {
    return (
        <section className="py-24 px-7 bg-white">
            <div className="container-custom !max-w-6xl md:!bg-[#f4f2f0] rounded-3xl p-0 md:p-16">
                <div className="grid md:grid-cols-[30%,1fr] gap-12 lg:gap-24">
                    {/* Left Column - Title & Intro */}
                    <div className="flex flex-col items-start">
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-heading text-heading leading-tight mb-8">
                            Start Trading<br />
                            Smarter In<br />
                            Minutes
                        </h2>
                        <Link
                            to="/predict"
                            className="inline-flex items-center justify-center bg-primary text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-1 transition-all text-base w-full md:w-auto"
                        >
                            Get Instant Analysis
                        </Link>
                    </div>

                    {/* Right Column - Steps */}
                    <div className="relative pl-5 lg:pl-12 border-l-2 border-gray-200">
                        <div className="space-y-12">
                            {/* Step 1 */}
                            <div className="relative">
                                <div className="absolute -left-[calc(2rem+1px)] lg:-left-[calc(3.8rem+1px)] top-0 bg-white border-2 border-primary w-6 h-6 rounded-full flex items-center justify-center">
                                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                                </div>
                                <div className="flex items-center mb-4">
                                    <div className="bg-primary/10 p-3 rounded-lg mr-4">
                                        <MousePointerClick className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-heading">1. Select Your Asset</h3>
                                </div>
                                <p className="text-gray-600 text-lg leading-relaxed max-w-lg">
                                    Choose from hundreds of supported stocks, crypto pairs, and forex markets. Search by symbol or browse top movers.
                                </p>
                            </div>

                            {/* Step 2 */}
                            <div className="relative">
                                <div className="absolute -left-[calc(2rem+1px)] lg:-left-[calc(3.8rem+1px)] top-0 bg-white border-2 border-primary w-6 h-6 rounded-full flex items-center justify-center">
                                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                                </div>
                                <div className="flex items-center mb-4">
                                    <div className="bg-primary/10 p-3 rounded-lg mr-4">
                                        <Settings className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-heading">2. Define Profile</h3>
                                </div>
                                <p className="text-gray-600 text-lg leading-relaxed max-w-lg">
                                    Customize your risk tolerance (Conservative, Moderate, Aggressive) and investment horizon to get tailored insights.
                                </p>
                            </div>

                            {/* Step 3 */}
                            <div className="relative">
                                <div className="absolute -left-[calc(2rem+1px)] lg:-left-[calc(3.8rem+1px)] top-0 bg-white border-2 border-primary w-6 h-6 rounded-full flex items-center justify-center">
                                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                                </div>
                                <div className="flex items-center mb-4">
                                    <div className="bg-primary/10 p-3 rounded-lg mr-4">
                                        <LineChart className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-heading">3. Get Analysis</h3>
                                </div>
                                <p className="text-gray-600 text-lg leading-relaxed max-w-lg">
                                    Receive instant, AI-generated price predictions, entry/exit points, and risk metrics powered by Gemini.
                                </p>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowToGetStarted;
