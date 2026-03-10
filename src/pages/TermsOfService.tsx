import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaShieldAlt } from 'react-icons/fa';
import Layout from '../components/landingpage/Layout';
import { ScrollReveal } from '../components/ui/ScrollReveal';

const TermsOfService = () => {
    return (
        <Layout>
            <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black">
                <Helmet>
                    <title>Terms of Service | Boostmysites</title>
                    <meta name="description" content="Terms of Service for Boostmysites platform. Read our legal terms, disclaimers, and user responsibilities." />
                </Helmet>

                {/* Hero Section */}
                <section className="relative pt-40 pb-20 px-4 overflow-hidden border-b border-white/5">
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 to-black pointer-events-none"></div>
                    <div className="container mx-auto relative z-10">
                        <ScrollReveal>
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 mb-8 transition-colors"
                            >
                                <FaArrowLeft /> Back to Home
                            </Link>
                            <div className="flex items-center gap-6 mb-6">
                                <div className="p-5 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 backdrop-blur-sm">
                                    <FaShieldAlt className="text-4xl text-cyan-400" />
                                </div>
                                <div>
                                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-2">Terms of Service</h1>
                                    <p className="text-gray-400 font-medium">Last Updated: 20-01-2025</p>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Content Section */}
                <section className="py-20 px-4 bg-zinc-950">
                    <div className="container mx-auto max-w-4xl">
                        <div className="space-y-12">

                            {/* Section 1 */}
                            <ScrollReveal delay={0.1}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">01.</span> Acceptance of Terms
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">
                                        By accessing or using our website, software, platform, demo, or any related services ("Service"), you agree to be bound by these Terms of Service ("Terms").
                                        If you do not agree, do not use the Service.
                                    </p>
                                    <div className="bg-cyan-500/10 border-l-4 border-cyan-500 p-4 rounded-r-lg">
                                        <p className="text-cyan-400 font-semibold">
                                            This is not optional. Continued usage = acceptance.
                                        </p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 2 */}
                            <ScrollReveal delay={0.2}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">02.</span> Nature of the Service (Critical Clause)
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        We provide AI-powered market analysis software that generates probability-based predictions for financial markets, including but not limited to stocks, forex, and cryptocurrencies.
                                    </p>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-6">
                                        <h3 className="text-lg font-bold text-red-400 mb-4 uppercase tracking-wider">We DO NOT:</h3>
                                        <ul className="space-y-3 text-gray-300">
                                            <li className="flex items-start gap-3">
                                                <span className="text-red-500 mt-1 font-bold">✗</span>
                                                <span>Provide buy or sell signals</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-red-500 mt-1 font-bold">✗</span>
                                                <span>Provide trading tips or calls</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-red-500 mt-1 font-bold">✗</span>
                                                <span>Provide personalized recommendations</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="text-red-500 mt-1 font-bold">✗</span>
                                                <span>Act as a financial advisor, broker, or signal provider</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <p className="text-white font-bold text-lg border-t border-white/10 pt-4">
                                        You make all trading decisions independently. We sell software tools — not trading advice.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 3 */}
                            <ScrollReveal delay={0.3}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">03.</span> No Investment Advice
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        All information provided through the Service is for educational and informational purposes only.
                                    </p>
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-6">
                                        <h3 className="text-lg font-bold text-yellow-400 mb-4 uppercase tracking-wider">Nothing on the platform constitutes:</h3>
                                        <ul className="space-y-2 text-gray-300">
                                            <li>• Financial advice</li>
                                            <li>• Investment advice</li>
                                            <li>• Trading advice</li>
                                            <li>• Portfolio management</li>
                                            <li>• A solicitation to buy or sell any financial instrument</li>
                                        </ul>
                                    </div>
                                    <p className="text-yellow-400 font-semibold italic">
                                        If you treat this as advice, that's your misuse, not our liability.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 4 */}
                            <ScrollReveal delay={0.4}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">04.</span> Eligibility
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">You must:</p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Be at least 18 years old</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Have legal capacity to enter a binding agreement</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Comply with all applicable local laws and regulations</span>
                                        </li>
                                    </ul>
                                    <p className="text-gray-400 italic text-sm">
                                        If trading is restricted in your jurisdiction, you are responsible, not us.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 5 */}
                            <ScrollReveal delay={0.5}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">05.</span> Accuracy & Performance Disclaimer
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">
                                        Any accuracy metrics, probability scores, backtests, or historical results shown:
                                    </p>
                                    <ul className="space-y-2 text-gray-300 mb-6 pl-4 border-l border-white/10">
                                        <li>• Are not guarantees</li>
                                        <li>• Vary by market conditions, timeframe, and asset</li>
                                        <li>• May differ between live and historical data</li>
                                    </ul>
                                    <p className="text-white font-semibold mb-2">
                                        Past performance does not predict future results.
                                    </p>
                                    <p className="text-gray-400 italic text-sm">
                                        If you expect certainty, this product is not for you.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 6 */}
                            <ScrollReveal delay={0.6}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">06.</span> User Responsibilities
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">You agree that:</p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">→</span>
                                            <span>You are solely responsible for your trades</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">→</span>
                                            <span>You understand the risks of financial markets</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">→</span>
                                            <span>You will not rely on the Service as a sole decision-making tool</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">→</span>
                                            <span>You will not claim reliance on the Service for losses</span>
                                        </li>
                                    </ul>
                                    <p className="text-red-400 font-semibold">
                                        Failure to understand risk is not our responsibility.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 7 */}
                            <ScrollReveal delay={0.7}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">07.</span> Payments & Access
                                    </h2>
                                    <ul className="space-y-2 text-gray-300 text-lg font-light">
                                        <li>• Fees are for software access only</li>
                                        <li>• No profit sharing, performance fees, or commissions</li>
                                        <li>• Demo access does not guarantee future availability</li>
                                        <li>• Pricing may change without prior notice</li>
                                        <li>• Refunds, if any, are governed strictly by the stated refund policy</li>
                                    </ul>
                                </div>
                            </ScrollReveal>

                            {/* Section 8 */}
                            <ScrollReveal delay={0.8}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">08.</span> Intellectual Property
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        All content, software, algorithms, UI, data structures, and branding are our intellectual property.
                                    </p>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-6">
                                        <h3 className="text-lg font-bold text-red-400 mb-4 uppercase tracking-wider">You may not:</h3>
                                        <ul className="space-y-2 text-gray-300">
                                            <li>• Copy</li>
                                            <li>• Reverse engineer</li>
                                            <li>• Resell</li>
                                            <li>• White-label (unless explicitly permitted)</li>
                                            <li>• Redistribute</li>
                                        </ul>
                                    </div>
                                    <p className="text-red-400 font-bold">
                                        Violation = immediate termination.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 9 */}
                            <ScrollReveal delay={0.9}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">09.</span> Limitation of Liability
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">
                                        To the maximum extent permitted by law, we are not liable for:
                                    </p>
                                    <ul className="space-y-2 text-gray-300 mb-6 pl-4 border-l border-white/10">
                                        <li>• Trading losses</li>
                                        <li>• Missed opportunities</li>
                                        <li>• Data delays or inaccuracies</li>
                                        <li>• Market volatility</li>
                                        <li>• Emotional or financial distress</li>
                                    </ul>
                                    <p className="text-white font-bold text-lg">
                                        You use the Service entirely at your own risk.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 10 */}
                            <ScrollReveal delay={1.0}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">10.</span> Termination
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-4 text-lg font-light">
                                        We may suspend or terminate access at any time if:
                                    </p>
                                    <ul className="space-y-2 text-gray-300 mb-4 pl-4 border-l border-white/10">
                                        <li>• Terms are violated</li>
                                        <li>• Abuse or misuse is detected</li>
                                        <li>• Legal or compliance risks arise</li>
                                    </ul>
                                    <p className="text-gray-400 font-semibold">
                                        No explanations required.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 11 */}
                            <ScrollReveal delay={1.1}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">11.</span> Governing Law
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed text-lg font-light">
                                        These Terms shall be governed by the laws of <span className="text-cyan-400 font-semibold">India</span>, without regard to conflict of law principles.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Final Notice */}
                            <ScrollReveal delay={1.2}>
                                <div className="p-8 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-3xl border border-cyan-500/30">
                                    <p className="text-center text-gray-300 text-base leading-relaxed">
                                        By using our Service, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
                                        If you have any questions, please contact us before using the Service.
                                    </p>
                                </div>
                            </ScrollReveal>

                        </div>
                    </div>
                </section>
            </div>
        </Layout>
    );
};

export default TermsOfService;
