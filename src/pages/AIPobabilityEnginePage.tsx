import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import AiPredictionHeader from '@/components/landingpage/mainlandingpage/AiPredictionHeader';
import AiPredictionFooter from '@/components/landingpage/mainlandingpage/AiPredictionFooter';
import abstractDataBg from '@/assets/abstract_data_bg.png';
import {
    FaBrain,
    FaNetworkWired,
    FaRobot,
    FaChartLine,
    FaRegClock,
    FaArrowRight,
    FaCheckCircle,
} from 'react-icons/fa';
import { BsGraphUpArrow } from 'react-icons/bs';
import { Button } from '@/components/ui/button';

const fadeUp: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15 },
    },
};

const AIPobabilityEnginePage = () => {
    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
            <Helmet>
                <title>AI-Based Order Placing System | TradingSmart.ai</title>
                <meta name="description" content="Learn about our AI-driven trading execution system that integrates directly with trading platforms. AI-powered intelligence." />
            </Helmet>

            <AiPredictionHeader />

            {/* 1. Hero Section */}
            <section className="relative pt-32 pb-20 px-4 overflow-hidden bg-black border-b border-zinc-900">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-600/10 rounded-full blur-[100px] z-0 pointer-events-none"></div>
                </div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="container mx-auto z-20 text-center relative max-w-4xl"
                >
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/20 bg-teal-500/5 backdrop-blur-sm mb-6"
                    >
                        <FaRobot className="text-teal-400" />
                        <span className="text-sm font-medium text-teal-300 tracking-wide uppercase">
                            AI Integrated Trading Intelligence
                        </span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-[1.1] text-white"
                    >
                        AI-Based Order <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
                            Placing System
                        </span>
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="text-lg md:text-xl text-zinc-400 mx-auto mb-10 font-light leading-relaxed"
                    >
                        TradingSmart AI is an AI-driven trading execution system that integrates directly with trading platforms through broker APIs and allows automated or assisted order placement using artificial intelligence.
                    </motion.p>
                </motion.div>
            </section>

            {/* 2. Overview */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 bg-zinc-950/50 relative border-b border-zinc-900"
            >
                <div className="container mx-auto px-4 max-w-5xl">
                    <motion.div variants={fadeUp} className="mb-12 text-center">
                        <h2 className="text-3xl md:text-4xl font-black mb-4 text-white">How it Connects</h2>
                        <p className="text-zinc-400 text-lg font-light">The platform connects three main components to execute trades directly from the broker's servers.</p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { title: "Market Data Engine", icon: <FaChartLine /> },
                            { title: "AI Decision Engine", icon: <FaBrain /> },
                            { title: "Broker API Execution Layer", icon: <FaNetworkWired /> },
                        ].map((item, i) => (
                            <motion.div
                                variants={fadeUp}
                                key={i}
                                className="bg-black p-8 rounded-3xl border border-zinc-800 hover:border-teal-500/50 transition-all flex flex-col items-center text-center group"
                            >
                                <div className="text-4xl text-teal-500 mb-6 group-hover:scale-110 transition-transform">{item.icon}</div>
                                <h3 className="text-xl font-bold text-zinc-100">{item.title}</h3>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 3. Steps (How it Works) */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-20 bg-black relative border-b border-zinc-900"
            >
                <div className="container mx-auto px-4 max-w-4xl">
                    <motion.div variants={fadeUp} className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black mb-4 text-white">How the AI Order System Works</h2>
                    </motion.div>

                    <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-teal-500/30 before:to-transparent">
                        {[
                            {
                                step: "Step 1",
                                title: "Market Data Collection",
                                desc: "The system collects data continuously in real time from multiple sources including live prices, order book, historical patterns, technical indicators, news sentiment, and volume.",
                                icon: <FaChartLine />
                            },
                            {
                                step: "Step 2",
                                title: "AI Analysis",
                                desc: "AI acts as the decision intelligence layer. It evaluates signals, sentiment, probability, strategy conditions, and risk to produce BUY/SELL/HOLD signals or automated commands.",
                                icon: <FaBrain />
                            },
                            {
                                step: "Step 3",
                                title: "Probability Engine",
                                desc: "Unlike normal algo trading with fixed rules (e.g., If RSI < 30 → BUY), this system uses probability models (e.g., 72% bullish breakout) to decide position size and entry point.",
                                icon: <BsGraphUpArrow />
                            },
                            {
                                step: "Step 4",
                                title: "Order Placement",
                                desc: "Once AI confirms the trade, the system sends an order securely through broker API integrations like Zerodha, Upstox, MetaTrader, Binance, and executes automatically.",
                                icon: <FaNetworkWired />
                            }
                        ].map((item, i) => (
                            <motion.div variants={fadeUp} key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-black bg-zinc-900 text-teal-500 font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow md:absolute md:left-1/2 relative z-10 group-hover:bg-teal-500 group-hover:text-black transition-colors">
                                    {item.icon}
                                </div>
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] bg-zinc-950 p-6 rounded-2xl border border-zinc-800 group-hover:border-teal-500/50 transition-colors">
                                    <div className="text-teal-500 text-sm font-bold mb-1">{item.step}</div>
                                    <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                                    <p className="text-zinc-400 font-light leading-relaxed text-sm">{item.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 4. Timeline / Integration */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 bg-zinc-950/50 relative border-b border-zinc-900"
            >
                <div className="container mx-auto px-4 max-w-5xl">
                    <motion.div variants={fadeUp} className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black mb-4 text-white">Why Integration Takes Around 2 Weeks</h2>
                        <p className="text-zinc-400 text-lg font-light max-w-2xl mx-auto">Although API trading itself is simple, production-level integration requires comprehensive testing and secure connection setup.</p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <motion.div variants={fadeUp} className="bg-black p-8 rounded-3xl border border-zinc-800">
                            <div className="flex items-center gap-3 mb-6">
                                <FaRegClock className="text-teal-500 text-2xl" />
                                <h3 className="text-2xl font-bold text-white">Week 1 — Core Integration</h3>
                            </div>
                            <ul className="space-y-4 text-zinc-300 font-light">
                                <li className="flex items-start gap-3"><span className="text-teal-500 mt-1">1.</span> Broker API authentication</li>
                                <li className="flex items-start gap-3"><span className="text-teal-500 mt-1">2.</span> Secure API key connection</li>
                                <li className="flex items-start gap-3"><span className="text-teal-500 mt-1">3.</span> Order placement testing</li>
                                <li className="flex items-start gap-3"><span className="text-teal-500 mt-1">4.</span> Live market data feed integration</li>
                                <li className="flex items-start gap-3"><span className="text-teal-500 mt-1">5.</span> Account balance and portfolio access</li>
                            </ul>
                        </motion.div>

                        <motion.div variants={fadeUp} className="bg-gradient-to-b from-teal-950/40 to-black p-8 rounded-3xl border border-teal-500/30">
                            <div className="flex items-center gap-3 mb-6">
                                <FaRegClock className="text-teal-400 text-2xl" />
                                <h3 className="text-2xl font-bold text-teal-50">Week 2 — AI and Stability Testing</h3>
                            </div>
                            <ul className="space-y-4 text-zinc-300 font-light">
                                <li className="flex items-start gap-3"><span className="text-teal-400 mt-1">1.</span> AI signal generation integration</li>
                                <li className="flex items-start gap-3"><span className="text-teal-400 mt-1">2.</span> Risk management rules</li>
                                <li className="flex items-start gap-3"><span className="text-teal-400 mt-1">3.</span> Latency optimization</li>
                                <li className="flex items-start gap-3"><span className="text-teal-400 mt-1">4.</span> Paper trading simulation</li>
                                <li className="flex items-start gap-3"><span className="text-teal-400 mt-1">5.</span> Order execution validation</li>
                            </ul>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            {/* 5. VS Comparison */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 bg-black relative border-b border-zinc-900"
            >
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen pointer-events-none"
                    style={{ backgroundImage: `url(${abstractDataBg})` }}
                ></div>
                <div className="container mx-auto px-4 max-w-5xl relative z-10">
                    <motion.div variants={fadeUp} className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black mb-4 text-white">Why This System Is Smarter</h2>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                        <motion.div variants={fadeUp} className="bg-red-950/20 p-8 rounded-3xl border border-red-900/50">
                            <h3 className="text-2xl font-bold text-red-500 mb-6">Traditional Algo Trading</h3>
                            <ul className="space-y-4 text-zinc-300 font-light mb-8">
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-red-500/50" /> Uses fixed rules</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-red-500/50" /> Limited strategies</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-red-500/50" /> No adaptive intelligence</li>
                            </ul>
                            <div className="bg-black/50 p-4 rounded-xl border border-red-900/30 text-center font-mono text-sm text-red-300">
                                Example: IF RSI {'<'} 30 → BUY
                            </div>
                        </motion.div>

                        <motion.div variants={fadeUp} className="bg-teal-950/20 p-8 rounded-3xl border border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.1)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-[50px] rounded-full"></div>

                            <h3 className="text-2xl font-bold text-teal-400 mb-6">AI-Driven TradingSmart</h3>
                            <ul className="space-y-4 text-zinc-200 font-light mb-8">
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-teal-500" /> Multi-indicator analysis</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-teal-500" /> Market sentiment interpretation</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-teal-500" /> Pattern recognition</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-teal-500" /> Dynamic strategy adaptation</li>
                                <li className="flex items-center gap-3"><FaCheckCircle className="text-teal-500" /> Real-time probability focus</li>
                            </ul>
                            <div className="bg-black/50 p-4 rounded-xl border border-teal-900/50 text-center font-mono text-sm text-teal-300">
                                Trade Probability: 72% Bullish Breakout
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            <AiPredictionFooter />
        </div>
    );
};

export default AIPobabilityEnginePage;
