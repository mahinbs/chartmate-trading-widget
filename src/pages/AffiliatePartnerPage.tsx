import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import AiPredictionHeader from '@/components/landingpage/mainlandingpage/AiPredictionHeader';
import AiPredictionFooter from '@/components/landingpage/mainlandingpage/AiPredictionFooter';
import abstractDataBg from '@/assets/abstract_data_bg.png';
import affiliateHeroBg from '@/assets/affiliate_hero_bg.png';
import {
    FaMoneyBillWave,
    FaChartLine,
    FaLink,
    FaHandshake,
    FaCheckCircle,
    FaArrowRight,
    FaRegClock,
    FaUsers
} from 'react-icons/fa';
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

const AffiliatePartnerPage = () => {
    // Generate some ambient background elements similar to the WhiteLabel Hero
    const [squares, setSquares] = useState<{ top: number, left: number }[]>([]);

    useEffect(() => {
        const generateSquares = () => {
            const newSquares = [];
            for (let i = 0; i < 6; i++) {
                newSquares.push({
                    top: Math.floor(Math.random() * 80) + 10,
                    left: Math.floor(Math.random() * 90) + 5
                });
            }
            setSquares(newSquares);
        };
        generateSquares();
        const interval = setInterval(generateSquares, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
            <Helmet>
                <title>Affiliate Partner Program | TradingSmart.ai</title>
                <meta name="description" content="Join the TradingSmart.ai Affiliate Program and earn recurring commissions by referring traders to our AI-powered analytical platform." />
            </Helmet>

            <AiPredictionHeader />

            {/* 1. Hero Section */}
            <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-32 pb-20 px-4 overflow-hidden bg-black border-b border-zinc-900">
                {/* Background Image */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none mix-blend-screen"
                    style={{ backgroundImage: `url(${affiliateHeroBg})` }}
                ></div>

                {/* Overlay Gradients for Depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black z-0 pointer-events-none"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-black/80 to-black z-0 pointer-events-none"></div>

                {/* Animated Background Canvas */}
                <div className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        backgroundImage: `
                        linear-gradient(to right, rgba(20,184,166,0.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(20,184,166,0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px'
                    }}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px] animate-pulse"></div>

                    {squares.map((pos, index) => (
                        <div
                            key={`square-${index}`}
                            className="absolute w-[60px] h-[60px] bg-teal-500/5 transition-all duration-1000 ease-in-out backdrop-blur-sm"
                            style={{
                                top: `${pos.top}%`,
                                left: `${pos.left}%`
                            }}
                        ></div>
                    ))}
                </div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="container mx-auto z-20 text-center relative max-w-5xl"
                >
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-teal-500/20 bg-teal-500/5 backdrop-blur-md mb-8 shadow-[0_0_20px_rgba(20,184,166,0.1)]"
                    >
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                        </span>
                        <span className="text-sm font-semibold text-teal-300 tracking-wide uppercase">
                            Official Affiliate Program
                        </span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-[1.05] text-white"
                    >
                        Earn with the Future of  
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
                            {" "} Trading AI.
                        </span>
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto mb-12 font-light leading-relaxed"
                    >
                        Partner with TradingSmart.ai and monetize your audience. Refer traders to our probability-based AI engine and earn industry-leading <strong>recurring commissions</strong> on every active subscription.
                    </motion.p>

                    <motion.div
                        variants={fadeUp}
                        className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16"
                    >
                        <Link to="/auth">
                            <Button className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg px-12 py-8 rounded-full shadow-[0_0_40px_rgba(20,184,166,0.3)] hover:shadow-[0_0_60px_rgba(20,184,166,0.5)] transition-all duration-300 hover:scale-105 active:scale-95">
                                Become a Partner
                            </Button>
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            {/* 2. Key Stats / Highlights */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-12 bg-zinc-950 border-b border-zinc-900"
            >
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
                        {[
                            { label: "Commission Rate", value: "Up to 30%", color: "text-emerald-400" },
                            { label: "Cookie Duration", value: "90 Days", color: "text-teal-400" },
                            { label: "Payout Frequency", value: "Monthly", color: "text-blue-400" },
                            { label: "Conversion Rate", value: "High", color: "text-purple-400" }
                        ].map((stat, i) => (
                            <motion.div variants={fadeUp} key={i} className="p-6 bg-black border border-zinc-800 rounded-3xl text-center hover:border-zinc-700 transition-colors shadow-lg">
                                <div className={`text-3xl md:text-4xl font-black ${stat.color} mb-2`}>{stat.value}</div>
                                <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">{stat.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 3. Why Partner With Us */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-20 bg-black relative border-b border-zinc-900"
            >
                <div className="container mx-auto px-4 max-w-6xl">
                    <motion.div variants={fadeUp} className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-black mb-6 text-white tracking-tight">Why Promote TradingSmart.ai?</h2>
                        <p className="text-zinc-400 text-xl font-light max-w-2xl mx-auto">We provide a premium, high-converting product that traders actually need to improve their strategies.</p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                title: "High Conversions",
                                desc: "Our landing pages are heavily optimized, and the product addresses the #1 pain point of algorithmic traders: unknown probabilities.",
                                icon: <FaChartLine />
                            },
                            {
                                title: "Recurring Revenue",
                                desc: "Earn commissions not just on the first sale, but every single month as long as your referred user remains subscribed.",
                                icon: <FaMoneyBillWave />
                            },
                            {
                                title: "Premium Branding",
                                desc: "You are associating your audience with a high-end, AI-driven fintech platform that builds trust and authority.",
                                icon: <FaHandshake />
                            }
                        ].map((item, i) => (
                            <motion.div
                                variants={fadeUp}
                                key={i}
                                className="bg-zinc-950 p-10 rounded-3xl border border-zinc-800 hover:border-teal-500/30 group transition-all duration-300 hover:-translate-y-1"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center text-3xl mb-8 group-hover:scale-110 group-hover:bg-teal-500/20 transition-all">
                                    {item.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4">{item.title}</h3>
                                <p className="text-zinc-400 font-light leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 4. How It Works */}
            <motion.section
                id="commission-structure"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-20 bg-zinc-950/50 relative border-b border-zinc-900"
            >
                <div className="container mx-auto px-4 max-w-5xl">
                    <motion.div variants={fadeUp} className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-black mb-6 text-white tracking-tight">How the Program Works</h2>
                    </motion.div>

                    <div className="relative">
                        <div className="hidden md:block absolute top-12 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-teal-900 to-transparent z-0"></div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
                            {[
                                {
                                    step: "01",
                                    title: "Register & Get Link",
                                    desc: "Sign up for the affiliate dashboard and instantly receive your unique tracking links and promo materials.",
                                    icon: <FaLink />
                                },
                                {
                                    step: "02",
                                    title: "Share with Audience",
                                    desc: "Promote TradingSmart.ai on your YouTube channel, Telegram group, email list, or trading blog.",
                                    icon: <FaUsers />
                                },
                                {
                                    step: "03",
                                    title: "Earn Recurring Cash",
                                    desc: "When they subscribe, you earn a percentage of their payment every month they stay active.",
                                    icon: <FaMoneyBillWave />
                                }
                            ].map((item, i) => (
                                <motion.div variants={fadeUp} key={i} className="flex flex-col items-center text-center relative group">
                                    <div className="w-24 h-24 rounded-full bg-black border border-zinc-800 flex flex-col items-center justify-center mb-8 relative z-10 group-hover:border-teal-500 shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-colors">
                                        <span className="text-teal-500 text-sm font-bold absolute top-2">{item.step}</span>
                                        <div className="text-3xl text-zinc-300 mt-3 group-hover:text-teal-400 transition-colors">{item.icon}</div>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-4">{item.title}</h3>
                                    <p className="text-zinc-400 font-light leading-relaxed">{item.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* 5. CTA Section */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-24 relative overflow-hidden flex items-center justify-center bg-black border-t border-zinc-900"
            >
                <div className="absolute inset-0 z-0">
                    <div
                        className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-screen pointer-events-none"
                        style={{ backgroundImage: `url(${abstractDataBg})` }}
                    ></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-teal-600/10 rounded-full blur-[120px]"></div>
                </div>

                <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-6xl font-black mb-8 text-white tracking-tight"
                    >
                        Ready to start earning?
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-zinc-400 text-xl font-light mb-12"
                    >
                        Join the fastest growing AI trading platform and turn your trailing audience into a steady stream of recurring revenue.
                    </motion.p>

                    <motion.div variants={fadeUp}>
                        <Link to="/auth">
                            <Button className="bg-teal-500 text-black hover:bg-teal-400 text-xl px-14 py-8 rounded-full font-bold border border-teal-400/50 shadow-[0_0_40px_rgba(20,184,166,0.2)] hover:shadow-[0_0_60px_rgba(20,184,166,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto">
                                Apply to Partner Program <FaArrowRight />
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </motion.section>

            <AiPredictionFooter />
        </div>
    );
};

export default AffiliatePartnerPage;
