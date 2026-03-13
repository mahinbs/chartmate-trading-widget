import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { useAffiliateRef } from '@/hooks/useAffiliateRef';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useMyTenantMembership } from '@/hooks/useWhitelabel';
import { supabase } from '@/integrations/supabase/client';
import { motion, Variants } from 'framer-motion';
import heroBg from '@/assets/premium_hero_bg.png';
import abstractDataBg from '@/assets/abstract_data_bg.png';

import {
    FaChartLine,
    FaNetworkWired,
    FaBrain,
    FaCheckCircle,
    FaTimesCircle,
    FaRobot,
    FaGlobe,
    FaChartBar,
    FaBitcoin,
    FaUserShield,
    FaArrowRight,
    FaLayerGroup,
} from "react-icons/fa";
import { MdTrendingUp, MdOutlinePriceChange } from "react-icons/md";
import { BiCctv } from "react-icons/bi";
import { BsGraphUpArrow } from "react-icons/bs";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "../components/ui/carousel";
import { Button } from "../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogClose,
} from "../components/ui/dialog";
import { X } from "lucide-react";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import AiPredictionHeader from "../components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "../components/landingpage/mainlandingpage/AiPredictionFooter";
import { PRICING_PLANS } from "@/constants/pricing";
import { toast } from "sonner";
import { createCheckoutSession } from "@/services/stripeService";

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

const MainLandingPage = () => {
    const { affiliateId } = useAffiliateRef();
    const { user, loading: authLoading } = useAuth();
    const { role, loading: roleLoading } = useUserRole();
    const { membership, loading: membershipLoading } = useMyTenantMembership(user?.id);
    const [activeTab, setActiveTab] = useState('stocks');
    const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);

    const [api, setApi] = useState<CarouselApi>();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (authLoading || roleLoading) return;
        if (!user || role !== "admin") return;
        if (membershipLoading) return;
        const wlSlug = membership?.role === "admin" && membership?.status === "active"
            ? membership?.tenant?.slug
            : null;
        if (wlSlug) navigate(`/wl/${wlSlug}/dashboard`, { replace: true });
        else navigate("/white-label#pricing", { replace: true });
    }, [user, role, authLoading, roleLoading, membershipLoading, membership, navigate]);

    interface FormData {
        name: string;
        email: string;
        phone: string;
        message: string;
        plan: string;
        referral_code: string;
    }

    const {
        register,
        handleSubmit,
        control,
        reset,
        setValue,
        formState: { errors }
    } = useForm<FormData>({
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            message: '',
            plan: '',
            referral_code: '',
        }
    });

    React.useEffect(() => {
        if (!api) {
            return;
        }

        const intervalId = setInterval(() => {
            api.scrollNext();
        }, 3000);

        return () => clearInterval(intervalId);
    }, [api]);

    const handleFormSubmit = async (data: FormData) => {
        setIsSubmitting(true);

        try {
            const planNames: Record<string, string> = {
                whiteLabel: "White Labelling Enquiry",
            };

            // Populate the plans dynamically from constants
            PRICING_PLANS.forEach((plan) => {
                planNames[plan.id] = `${plan.name} - $${plan.price}`;
            });

            const emailBody = `Name : ${data.name}\nEmail : ${data.email}\nPhone : ${data.phone}\nInterested Plan : ${planNames[data.plan] || data.plan}\nMessage : \n ${data.message || "N/A"}`;

            await (supabase as any).from('contact_submissions').insert([{
                name: data.name,
                email: data.email,
                phone: data.phone,
                description: `Plan: ${planNames[data.plan as keyof typeof planNames] || data.plan}\n${data.message || ''}`,
                ...(affiliateId && { affiliate_id: affiliateId }),
                ...(data.referral_code?.trim() && { referral_code: data.referral_code.trim() }),
            }]).then(() => { }).catch(() => { });

            const response = await fetch('https://send-mail-redirect-boostmysites.vercel.app/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    body: emailBody,
                    name: 'Tradingsmart.AI',
                    subject: `New Enquiry from ${data.name} - ${planNames[data.plan as keyof typeof planNames] || data.plan}`,
                    to: 'partnerships@tradingsmart.ai'
                })
            });

            if (response.ok) {
                reset();
                setIsSubmitSuccess(true);
            } else {
                alert('Failed to submit form. Please try again.');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('An error occurred. Please try again later.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
            <Helmet>
                <title>AI-Powered Algo Analysis & Paper Trading</title>
                <meta name="description" content="Connect your trading bot, analyze strategy probability, and test trades safely with advanced AI insights." />
            </Helmet>

            <AiPredictionHeader />

            {/* 1. Hero Section */}
            <section id="hero" className="relative min-h-screen flex items-center justify-center pt-32 pb-20 px-4 overflow-hidden bg-black">
                <div className="absolute inset-0 z-0">
                    {/* Premium Dark Background */}
                    <div className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen" style={{ backgroundImage: `url(${heroBg})` }}></div>

                    {/* Deep Fade Gradients */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent z-10"></div>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_black_90%)] z-10"></div>

                    {/* Subtle Teal Core Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-teal-600/10 rounded-full blur-[100px] z-0"></div>
                </div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="container mx-auto z-20 text-center relative max-w-6xl"
                >
                    <motion.div
                        variants={fadeUp}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/20 bg-teal-500/5 backdrop-blur-sm mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                        <span className="text-sm font-medium text-teal-300 tracking-wide uppercase">
                            AI-Powered Algo Analysis
                        </span>
                    </motion.div>

                    <motion.h1
                        variants={fadeUp}
                        className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight mb-8 leading-[1.05] text-white"
                    >
                        Trade Smarter with <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
                            Strategy Intelligence.
                        </span>
                    </motion.h1>

                    <motion.p
                        variants={fadeUp}
                        className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 font-light leading-relaxed"
                    >
                        Connect your trading bot, analyze strategy probability, and test
                        trades safely with advanced AI insights and paper trading. Automate
                        your trading intelligence without risking real capital.
                    </motion.p>

                    <motion.div
                        variants={fadeUp}
                        className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-10"
                    >
                        <Button
                            onClick={() => setIsEnquiryModalOpen(true)}
                            className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg px-10 py-7 rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:shadow-[0_0_50px_rgba(20,184,166,0.5)] border border-teal-400/50 transition-all duration-300 hover:-translate-y-0.5"
                        >
                            Start Now
                        </Button>
                        <Link to="/ai-probability-engine">
                            <Button
                                variant="outline"
                                className="bg-transparent border border-zinc-700 hover:border-teal-500 hover:bg-teal-500/10 text-white font-bold text-lg px-10 py-7 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
                            >
                                AI Robot Trade
                            </Button>
                        </Link>
                    </motion.div>

                    <motion.div
                        variants={fadeUp}
                        className="flex flex-wrap justify-center gap-6 text-sm text-zinc-300 font-medium"
                    >
                        <span className="flex items-center gap-2">
                            <FaCheckCircle className="text-teal-500" /> Connect Strategy
                        </span>
                        <span className="flex items-center gap-2">
                            <FaCheckCircle className="text-teal-500" /> Analyze Probability
                        </span>
                        <span className="flex items-center gap-2">
                            <FaCheckCircle className="text-teal-500" /> Test with Paper
                            Trading
                        </span>
                    </motion.div>
                </motion.div>
            </section>

            {/* 2. Problem Section */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                id="problem"
                className="py-16 border-t border-zinc-900 bg-black relative"
            >
                <div className="container mx-auto px-4 text-center relative z-10">
                    <motion.div variants={fadeUp} className="max-w-4xl mx-auto mb-20">
                        <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">
                            Most traders build or purchase algorithmic strategies but{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                                struggle
                            </span>
                            .
                        </h2>
                        <p className="text-zinc-400 text-xl font-light">
                            Without proper analysis, even good strategies can fail.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 text-left">
                        {[
                            {
                                icon: <FaNetworkWired />,
                                title: "Unknown Probabilities",
                                desc: "They don’t know the true probability of success for their specific setups and entries.",
                            },
                            {
                                icon: <FaChartBar />,
                                title: "Poor Analysis",
                                desc: "They cannot properly analyze their strategy's performance over varied market conditions.",
                            },
                            {
                                icon: <FaTimesCircle />,
                                title: "Risky Testing",
                                desc: "Testing with real money from day one becomes an unnecessary and dangerous risk.",
                            },
                        ].map((item, i) => (
                            <motion.div
                                variants={fadeUp}
                                key={i}
                                className="bg-zinc-950 p-8 rounded-3xl border border-zinc-800 transition-all duration-300 group h-full hover:-translate-y-1 hover:border-red-500/20"
                            >
                                <div className="p-4 bg-red-500/10 w-fit rounded-2xl mb-6 text-red-500 text-3xl group-hover:scale-110 group-hover:bg-red-500/20 transition-all">
                                    {item.icon}
                                </div>
                                <h3 className="text-2xl font-bold mb-4 text-zinc-100">
                                    {item.title}
                                </h3>
                                <p className="text-zinc-400 leading-relaxed font-light">
                                    {item.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 3. Solution Section */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                id="solution"
                className="py-16 bg-zinc-950/50 border-t border-zinc-900 relative"
            >
                <div className="container mx-auto px-4 text-center">
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white"
                    >
                        A Smarter Way to Evaluate Your Trading Strategy
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-zinc-400 text-xl font-light max-w-3xl mx-auto mb-20"
                    >
                        Our platform connects directly with your trading algorithm and uses
                        AI to analyze every signal generated by your strategy. Instead of
                        guessing, you get clear insights.
                    </motion.p>

                    <div className="flex flex-wrap justify-center gap-4">
                        {[
                            { title: "Entry / Exit Accuracy", icon: <FaChartLine /> },
                            { title: "Strategy Probability", icon: <FaBrain /> },
                            { title: "Historical Performance", icon: <BsGraphUpArrow /> },
                            { title: "Risk Exposure", icon: <FaUserShield /> },
                            { title: "Trade Behavior Patterns", icon: <FaNetworkWired /> },
                        ].map((item, i) => (
                            <motion.div
                                variants={fadeUp}
                                key={i}
                                className="w-full sm:w-[calc(50%-1rem)] lg:w-[calc(20%-1rem)] group relative bg-zinc-950 p-8 rounded-3xl border border-zinc-800 hover:border-teal-500/50 transition-all duration-300 flex flex-col items-center justify-center text-center"
                            >
                                <div className="text-teal-500 text-4xl mb-4 group-hover:scale-110 transition-transform">
                                    {item.icon}
                                </div>
                                <h3 className="text-lg font-bold text-white leading-tight">
                                    {item.title}
                                </h3>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 4. How It Works */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                id="how-it-works"
                className="py-16 bg-black border-t border-zinc-900 relative"
            >
                <div className="container mx-auto px-4 relative z-10">
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-5xl font-black mb-24 text-center text-white tracking-tight"
                    >
                        How It Works
                    </motion.h2>

                    <div className="relative">
                        <div className="hidden lg:block absolute top-10 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-teal-900 to-transparent z-0"></div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-12 relative z-10">
                            {[
                                {
                                    title: "1. Connect Algo Bot",
                                    icon: <FaNetworkWired />,
                                    desc: "Integrate your trading algorithm or strategy with our platform securely.",
                                },
                                {
                                    title: "2. AI Strategy Analysis",
                                    icon: <FaBrain />,
                                    desc: "Our system analyzes trade signals, entries, and win rates using advanced data models.",
                                },
                                {
                                    title: "3. Probability Insights",
                                    icon: <BsGraphUpArrow />,
                                    desc: "Get clear probability-based insights to understand how likely your strategy is to succeed.",
                                    highlight: true,
                                },
                                {
                                    title: "4. Paper Trading",
                                    icon: <FaUserShield />,
                                    desc: "Test strategies in a real-market environment without risking capital.",
                                },
                                {
                                    title: "5. Strategy Optimization",
                                    icon: <FaChartLine />,
                                    desc: "Improve and refine your strategy based on AI-generated insights.",
                                },
                            ].map((step, i) => (
                                <motion.div
                                    variants={fadeUp}
                                    key={i}
                                    className={`relative flex flex-col items-center text-center group sm:[&:nth-child(5)]:col-span-2 lg:[&:nth-child(5)]:col-span-1`}
                                >
                                    <div
                                        className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl mb-6 transition-all duration-300 border ${step.highlight ? "bg-zinc-900 border-teal-500 text-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.2)] scale-110" : "bg-zinc-950 border-zinc-800 text-zinc-500 group-hover:border-teal-500/30 group-hover:text-teal-400 group-hover:bg-zinc-900"}`}
                                    >
                                        {step.icon}
                                    </div>
                                    <h3
                                        className={`text-xl font-bold mb-3 ${step.highlight ? "text-teal-400" : "text-zinc-100"}`}
                                    >
                                        {step.title}
                                    </h3>
                                    <p className="text-sm text-zinc-500 leading-relaxed max-w-[200px] font-light">
                                        {step.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* 5. Key Features */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 bg-black relative border-t border-zinc-900"
            >
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen pointer-events-none"
                    style={{ backgroundImage: `url(${abstractDataBg})` }}
                ></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black z-0"></div>

                <div className="container mx-auto px-4 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
                        <motion.div
                            variants={fadeUp}
                            className="order-2 lg:order-1 relative"
                        >
                            <div className="bg-zinc-950/90 backdrop-blur-xl p-8 md:p-12 rounded-3xl border border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                                <ul className="space-y-6 md:space-y-8 text-zinc-300">
                                    {[
                                        {
                                            t: "Algo Bot Integration",
                                            d: "Easily connect your trading bot or algorithmic strategy to our platform.",
                                        },
                                        {
                                            t: "AI Strategy Intelligence",
                                            d: "Understand how your strategy behaves under different market conditions.",
                                        },
                                        {
                                            t: "Probability-Based Trade Insights",
                                            d: "Get probability analysis for entries, exits, and trade outcomes.",
                                        },
                                        {
                                            t: "Advanced Backtesting",
                                            d: "Evaluate historical performance using large datasets.",
                                        },
                                        {
                                            t: "Paper Trading Environment",
                                            d: "Test strategies safely without using real funds.",
                                        },
                                        {
                                            t: "Strategy Performance Dashboard",
                                            d: "Visualize win rates, drawdowns, trade frequency, and profitability.",
                                        },
                                    ].map((feature, i) => (
                                        <li key={i} className="flex gap-4 md:gap-5 group">
                                            <div className="mt-1 flex-shrink-0 text-teal-500 group-hover:scale-110 transition-transform">
                                                <FaCheckCircle className="text-xl" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-lg text-white mb-1">
                                                    {feature.t}
                                                </h4>
                                                <p className="text-sm text-zinc-400 leading-relaxed font-light">
                                                    {feature.d}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>

                        <motion.div variants={fadeUp} className="order-1 lg:order-2">
                            <h2 className="text-4xl md:text-5xl font-black mb-10 text-white tracking-tight">
                                Key Features
                            </h2>
                            <p className="text-zinc-400 font-light leading-relaxed mb-8 text-xl">
                                We've built an ecosystem specifically designed to turn your
                                algorithmic ideas into proven, verifiable assets. Connect,
                                evaluate, and scale up with complete confidence in your systems.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            {/* 6. Who This Is For & Benefits */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 bg-zinc-950 border-t border-zinc-900"
            >
                <div className="container mx-auto px-4">
                    <div className="grid lg:grid-cols-2 gap-16 md:gap-20">
                        {/* Who this is for */}
                        <motion.div variants={fadeUp}>
                            <h2 className="text-3xl md:text-5xl font-black mb-10 text-white tracking-tight">
                                Who This Is For
                            </h2>
                            <ul className="space-y-4">
                                {[
                                    "Algo traders",
                                    "Quant traders",
                                    "Strategy developers",
                                    "Trading educators",
                                    "Prop trading firms",
                                ].map((user, i) => (
                                    <li
                                        key={i}
                                        className="flex items-center justify-between gap-4 text-lg md:text-xl font-bold text-zinc-300 bg-black p-6 rounded-2xl border border-zinc-800 hover:border-teal-500/30 hover:bg-zinc-900 transition-all"
                                    >
                                        {user}
                                        <FaCheckCircle className="text-teal-500 text-2xl" />
                                    </li>
                                ))}
                            </ul>
                        </motion.div>

                        {/* Benefits */}
                        <motion.div variants={fadeUp}>
                            <h2 className="text-3xl md:text-5xl font-black mb-10 text-white tracking-tight">
                                Benefits
                            </h2>
                            <div className="grid gap-6">
                                {[
                                    {
                                        title: "Trade with Data",
                                        desc: "Trade with data, not emotions.",
                                    },
                                    {
                                        title: "Reduce Strategy Risk",
                                        desc: "Reduce strategy risk before deploying real capital.",
                                    },
                                    {
                                        title: "Understand True Probability",
                                        desc: "Understand the true probability of your trading system.",
                                    },
                                    {
                                        title: "Improve Strategy Performance",
                                        desc: "Improve strategy performance fast using actionable AI insights.",
                                    },
                                ].map((item, i) => (
                                    <div
                                        key={i}
                                        className="p-8 bg-black border border-zinc-800 rounded-3xl hover:border-teal-500/20 transition-colors"
                                    >
                                        <h3 className="text-xl font-bold mb-2 text-teal-400">
                                            {item.title}
                                        </h3>
                                        <p className="text-zinc-400 leading-relaxed font-light">
                                            {item.desc}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.section>

            {/* 7. Pricing Section */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                id="pricing"
                className="py-16 bg-zinc-950 border-t border-zinc-900 relative"
            >
                <div className="container mx-auto px-4 relative z-10">
                    <motion.div
                        variants={fadeUp}
                        className="text-center mb-16 max-w-3xl mx-auto"
                    >
                        <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">
                            Pricing Plans
                        </h2>
                        <p className="text-zinc-400 text-xl font-light">
                            Use AI to analyze probabilities and automate trades with powerful
                            algorithmic intelligence.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
                        {PRICING_PLANS.map((plan, i) => (
                            <motion.div
                                key={plan.id}
                                variants={fadeUp}
                                className={`p-8 rounded-3xl flex flex-col relative transition-all shadow-lg hover:border-zinc-700 ${plan.recommended
                                    ? "bg-gradient-to-b from-teal-950/40 to-black border border-teal-500/30 shadow-[0_0_40px_rgba(20,184,166,0.1)] lg:h-[110%] lg:-mt-[7%] lg:mb-[5%]"
                                    : "bg-black border border-zinc-800"
                                    }`}
                            >
                                {plan.recommended && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-teal-500 text-black text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest">
                                        Recommended
                                    </div>
                                )}
                                <h3
                                    className={`text-xl font-bold mb-2 ${plan.recommended ? "text-teal-400" : "text-zinc-200"}`}
                                >
                                    {plan.name}
                                </h3>
                                <div
                                    className={`${plan.recommended ? "text-zinc-400" : "text-zinc-500"} mb-6 font-light text-sm min-h-[40px]`}
                                >
                                    {plan.description}
                                </div>
                                <div className="text-4xl font-black mb-6 tracking-tight text-white">
                                    ${plan.price}
                                    <span
                                        className={`text-lg ${plan.recommended ? "text-zinc-500" : "text-zinc-600"} font-normal ml-1 tracking-normal`}
                                    >
                                        /{plan.period}
                                    </span>
                                </div>
                                <ul
                                    className={`space-y-4 mb-10 flex-1 text-sm ${plan.recommended ? "text-zinc-200" : "text-zinc-300"}`}
                                >
                                    {plan.features.map((feature, j) => (
                                        <li key={j} className="flex gap-3 items-center">
                                            <FaCheckCircle
                                                className={`${plan.recommended ? "text-teal-400" : "text-teal-500"} flex-shrink-0`}
                                            />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    onClick={async () => {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        if (!session) {
                                            navigate('/auth?redirect=' + encodeURIComponent('/#pricing'));
                                            return;
                                        }
                                        const result = await createCheckoutSession({
                                            plan_id: plan.id,
                                            success_url: window.location.origin + '/algo-setup?checkout=success',
                                            cancel_url: window.location.origin + '/#pricing',
                                        });
                                        if (result.error) {
                                            toast.error(result.error);
                                            return;
                                        }
                                        if (result.url) window.location.href = result.url;
                                    }}
                                    className={
                                        plan.recommended
                                            ? "w-full py-6 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl transition-colors shadow-lg shadow-teal-500/20"
                                            : "w-full py-6 bg-zinc-100 text-black hover:bg-zinc-300 rounded-xl font-bold transition-colors"
                                    }
                                >
                                    {plan.recommended ? "Get Pro Plan" : "Get Started"}
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* 8. White Labelling Option */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                id="white-label"
                className="py-16 bg-black border-t border-zinc-900 relative"
            >
                <div className="container mx-auto px-4 text-center z-10 relative">
                    <motion.h2
                        variants={fadeUp}
                        className="text-4xl md:text-5xl font-black mb-6 text-white tracking-tight"
                    >
                        White Labelling
                    </motion.h2>
                    <motion.p
                        variants={fadeUp}
                        className="text-zinc-400 text-xl font-light max-w-2xl mx-auto mb-16"
                    >
                        Offer our powerful analytical engine to your own users under your
                        brand name.
                    </motion.p>

                    <motion.div
                        variants={fadeUp}
                        className="max-w-4xl mx-auto bg-gradient-to-br from-teal-950/40 to-black border border-teal-500/20 rounded-3xl p-10 md:p-16 relative overflow-hidden text-left shadow-[0_0_50px_rgba(20,184,166,0.1)]"
                    >
                        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                            <FaGlobe className="text-9xl text-teal-500" />
                        </div>
                        <h3 className="text-3xl font-bold text-white mb-6">
                            Launch Your Own AI Trading Platform
                        </h3>
                        <p className="text-zinc-300 font-light mb-8 max-w-xl text-lg leading-relaxed">
                            Integrate our advanced probability models, paper trading
                            environment, and AI analysis directly into your ecosystem via API
                            or a fully hosted white-label front-end.
                        </p>
                        <Link to="/white-label">
                            <Button className="bg-white text-black hover:bg-zinc-200 font-bold px-8 py-6 rounded-xl transition-all hover:scale-105">
                                Know More
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </motion.section>

            {/* 9. Call To Action */}
            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={staggerContainer}
                className="py-16 relative overflow-hidden flex items-center justify-center min-h-[50vh] bg-zinc-950 border-t border-zinc-900"
            >
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-600/5 rounded-full blur-[100px]"></div>
                </div>

                <div className="container mx-auto px-4 relative z-10 text-center">
                    <motion.h2
                        variants={fadeUp}
                        className="text-5xl md:text-7xl font-black mb-8 text-white tracking-tight leading-none"
                    >
                        Start analyzing your <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
                            trading strategy today.
                        </span>
                    </motion.h2>
                    <motion.div
                        variants={fadeUp}
                        className="text-zinc-400 text-xl font-light mb-12 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4"
                    >
                        <span>Connect your algo.</span>
                        <span className="hidden md:inline">•</span>
                        <span>Discover its true probability.</span>
                        <span className="hidden md:inline">•</span>
                        <span>Trade with confidence.</span>
                    </motion.div>

                    <motion.div variants={fadeUp} className="relative inline-block group">
                        <Button
                            onClick={() => setIsEnquiryModalOpen(true)}
                            className="relative bg-teal-500 text-black hover:bg-teal-400 text-lg sm:text-2xl px-12 sm:px-16 py-8 rounded-full font-bold border border-teal-400/50 shadow-[0_0_30px_rgba(20,184,166,0.2)] hover:shadow-[0_0_50px_rgba(20,184,166,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-4 mx-auto"
                        >
                            Start Now <FaArrowRight />
                        </Button>
                    </motion.div>
                </div>
            </motion.section>

            <AiPredictionFooter />

            {/* Enquiry Form Modal */}
            <Dialog open={isEnquiryModalOpen} onOpenChange={(open) => { setIsEnquiryModalOpen(open); if (!open) setIsSubmitSuccess(false); }}>
                <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] bg-zinc-950 border border-zinc-800 text-white p-6 sm:p-8 rounded-3xl shadow-2xl overflow-y-auto">

                    {isSubmitSuccess ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-6">
                            <div className="w-20 h-20 rounded-full bg-teal-500/15 flex items-center justify-center">
                                <svg className="w-10 h-10 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-black text-white mb-2">Request Submitted!</DialogTitle>
                                <p className="text-zinc-400 font-light">Thank you! Our partnerships team will reach out to you shortly.</p>
                            </div>
                            <Button
                                onClick={() => { setIsEnquiryModalOpen(false); setIsSubmitSuccess(false); }}
                                className="bg-teal-500 hover:bg-teal-400 text-black font-bold px-8 py-3 rounded-xl"
                            >
                                Close
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative border-b border-zinc-800 pb-4 mb-6 pr-10">
                                <DialogTitle className="text-3xl font-black text-white text-left tracking-tight">
                                    Start Now
                                </DialogTitle>
                                <p className="text-zinc-400 text-sm mt-2 text-left font-light">
                                    Fill out the form below and our partnerships team will reach out.
                                </p>
                            </div>

                            <form className="space-y-6" onSubmit={handleSubmit(handleFormSubmit)}>
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Name Field */}
                                    <div className="space-y-2 text-left">
                                        <Label htmlFor="name" className="text-zinc-300 font-medium">
                                            Full Name <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="name"
                                            type="text"
                                            placeholder="John Doe"
                                            {...register("name", { required: "Full name is required" })}
                                            className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.name ? "border-red-500" : ""}`}
                                        />
                                        {errors.name && (
                                            <p className="text-red-500 text-xs mt-1">
                                                {errors.name.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Email Field */}
                                    <div className="space-y-2 text-left">
                                        <Label htmlFor="email" className="text-zinc-300 font-medium">
                                            Email Address <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="john@example.com"
                                            {...register("email", {
                                                required: "Email is required",
                                                pattern: {
                                                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                                    message: "Invalid email address",
                                                },
                                            })}
                                            className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.email ? "border-red-500" : ""}`}
                                        />
                                        {errors.email && (
                                            <p className="text-red-500 text-xs mt-1">
                                                {errors.email.message}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Phone Field */}
                                    <div className="space-y-2 text-left">
                                        <Label htmlFor="phone" className="text-zinc-300 font-medium">
                                            Phone Number <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="+1 234 567 8900"
                                            {...register("phone", {
                                                required: "Phone number is required",
                                                pattern: {
                                                    value: /^\+?[0-9\s-]+$/,
                                                    message: "Please enter a valid phone number",
                                                },
                                            })}
                                            className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.phone ? "border-red-500" : ""}`}
                                        />
                                        {errors.phone && (
                                            <p className="text-red-500 text-xs mt-1">
                                                {errors.phone.message}
                                            </p>
                                        )}
                                    </div>

                                    {/* Plan Selection */}
                                    <div className="space-y-2 text-left">
                                        <Label htmlFor="plan" className="text-zinc-300 font-medium">
                                            Interested Plan <span className="text-red-500">*</span>
                                        </Label>
                                        <Controller
                                            name="plan"
                                            control={control}
                                            rules={{ required: "Please select a plan" }}
                                            render={({ field }) => (
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger
                                                        className={`bg-black border-zinc-800 text-white focus:border-teal-500 focus:ring-teal-500/20 ${errors.plan ? "border-red-500" : ""}`}
                                                    >
                                                        <SelectValue placeholder="Select a plan/option" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                                                        {PRICING_PLANS.map((plan) => (
                                                            <SelectItem
                                                                key={plan.id}
                                                                value={plan.id}
                                                                className="focus:bg-teal-500/20 focus:text-teal-400"
                                                            >
                                                                {plan.name} - ${plan.price}
                                                            </SelectItem>
                                                        ))}
                                                        <SelectItem
                                                            value="whiteLabel"
                                                            className="focus:bg-teal-500/20 focus:text-teal-400"
                                                        >
                                                            White Labelling Enquiry
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.plan && (
                                            <p className="text-red-500 text-xs mt-1">
                                                {errors.plan.message}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Message Field */}
                                <div className="space-y-2 text-left">
                                    <Label htmlFor="message" className="text-zinc-300 font-medium">
                                        Message (Optional)
                                    </Label>
                                    <Textarea
                                        id="message"
                                        placeholder="Tell us about yourself..."
                                        rows={4}
                                        {...register("message")}
                                        className="bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all resize-none"
                                    />
                                </div>

                                {/* Referral Code Field */}
                                <div className="space-y-2 text-left">
                                    <Label htmlFor="referral_code" className="text-zinc-300 font-medium">
                                        Referral Code
                                        <span className="ml-2 text-xs font-normal text-zinc-500">(Optional)</span>
                                    </Label>
                                    <Input
                                        id="referral_code"
                                        type="text"
                                        placeholder="e.g. john2024"
                                        {...register('referral_code')}
                                        className="bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all"
                                    />
                                    <p className="text-xs text-teal-400/70">
                                        💡 Have a referral code? Enter it for faster enquiry replies and priority support.
                                    </p>
                                </div>

                                {/* Submit Button */}
                                <div className="flex gap-4 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsEnquiryModalOpen(false)}
                                        className="flex-1 bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors h-14 rounded-xl font-bold"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 bg-teal-500 hover:bg-teal-400 text-black font-bold h-14 rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Submit Request'}
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MainLandingPage;
