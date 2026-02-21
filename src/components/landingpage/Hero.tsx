import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Square {
    top: number;
    left: number;
}

interface Drop {
    id: number;
    key: number;
    left: number;
    duration: number;
    delay: number;
}

const Hero = () => {
    const [squares, setSquares] = useState<Square[]>([]);
    const [drops, setDrops] = useState<Drop[]>([]);
    const recentDropsRef = useRef<number[]>([]);

    // Helper to get a unique grid position
    const getUniqueLeft = () => {
        let left;
        let attempts = 0;
        do {
            left = Math.floor(Math.random() * 20) * 80;
            attempts++;
        } while (recentDropsRef.current.includes(left) && attempts < 10);

        // Update recent positions
        recentDropsRef.current = [left, ...recentDropsRef.current].slice(0, 6); // Keep last 6 positions
        return left;
    };

    useEffect(() => {
        // Function to generate random grid positions for squares
        const generateSquares = () => {
            const newSquares = [];
            const numSquares = 5; // Number of active squares

            for (let i = 0; i < numSquares; i++) {
                const top = Math.floor(Math.random() * 10) * 80; // 0 to 800px
                const left = Math.floor(Math.random() * 20) * 80; // 0 to 1600px
                newSquares.push({ top, left });
            }
            setSquares(newSquares);
        };

        // Initialize drops
        const initDrops = () => {
            const newDrops = [];
            const numDrops = 3; // Only 3 drops at a time

            for (let i = 0; i < numDrops; i++) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2; // 2-4s duration
                const delay = Math.random() * 3; // Initial random delay
                newDrops.push({
                    id: i,
                    key: i, // Key to force re-render
                    left,
                    duration,
                    delay
                });
            }
            setDrops(newDrops);
        };

        generateSquares();
        initDrops();

        const interval = setInterval(generateSquares, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleDropAnimationEnd = (dropId: number) => {
        setDrops(prevDrops => prevDrops.map(drop => {
            if (drop.id === dropId) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2;
                // Add a small delay before next drop to vary the rhythm
                const delay = Math.random() * 2;
                return {
                    ...drop,
                    key: drop.key + 1, // Increment key to restart animation
                    left,
                    duration,
                    delay
                };
            }
            return drop;
        }));
    };

    return (
        <section className="relative bg-white pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
            {/* Grid Background */}
            <div className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(to right, #f0f0f0 1px, transparent 1px),
            linear-gradient(to bottom, #f0f0f0 1px, transparent 1px)
          `,
                    backgroundSize: '80px 80px'
                }}
            >
                {/* Dynamic colored squares */}
                {squares.map((pos, index) => (
                    <div
                        key={`square-${index}`}
                        className="absolute w-[80px] h-[80px] bg-primary/5 transition-all duration-1000 ease-in-out"
                        style={{
                            top: `${pos.top}px`,
                            left: `${pos.left}px`
                        }}
                    ></div>
                ))}

                {/* Drops */}
                {drops.map((drop) => (
                    <div
                        key={`${drop.id}-${drop.key}`}
                        className="absolute w-[2px] h-[150px] bg-gradient-to-b from-transparent to-primary animate-drop"
                        style={{
                            left: `${drop.left}px`,
                            top: '-150px',
                            animationDuration: `${drop.duration}s`,
                            animationDelay: `${drop.delay}s`
                        }}
                        onAnimationEnd={() => handleDropAnimationEnd(drop.id)}
                    ></div>
                ))}
            </div>

            <div className="container-custom relative z-10 flex flex-col items-center text-center">

                {/* Chartmate Badge */}
                <div className="mb-8 bg-white border border-gray-200 rounded-full px-4 py-1.5 flex items-center shadow-sm animate-fade-in-up">
                    <span className="font-bold text-heading text-sm mr-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        ChartMate AI
                    </span>
                    <div className="text-xs text-gray-500 font-medium border-l border-gray-200 pl-2">
                        Now Live
                    </div>
                </div>

                {/* Main Headline */}
                <h1 className="max-w-5xl text-5xl md:text-6xl lg:text-7xl font-bold font-heading text-heading leading-[1.1] mb-8 tracking-tight">
                    Decode the Market. Then Define Your <span className="text-primary relative inline-block">
                        Edge
                        <svg className="absolute w-full h-3 -bottom-1 left-0 text-primary opacity-20" viewBox="0 0 100 10" preserveAspectRatio="none">
                            <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="3" fill="none" />
                        </svg>
                    </span>
                </h1>

                {/* Description */}
                <div className="max-w-3xl mx-auto mb-12">
                    <p className="text-xl text-gray-600 mb-6 leading-relaxed">
                        Analyze Market Probabilities With AI Precision. Stop guessing and understand your trades with the power of AI. Get multi-horizon forecasts, real-time risk management, and institutional-grade analytics.
                    </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mb-20 animate-fade-in-up delay-100">
                    <Link to="/predict" className="bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-lg shadow-lg shadow-primary/20 transition-all hover:-translate-y-1 font-bold text-lg flex items-center justify-center">
                        Start Free Analysis
                        <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                    <Link to="/contact-us" className="bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-lg shadow-lg shadow-primary/20 transition-all hover:-translate-y-1 font-bold text-lg flex items-center justify-center">
                        Get Started
                        <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                    <button
                        onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                        className="bg-white border border-gray-200 text-heading px-8 py-4 rounded-lg shadow-sm hover:bg-gray-50 transition-all font-bold text-lg flex items-center justify-center cursor-pointer"
                    >
                        <BarChart2 className="mr-2 w-5 h-5 text-gray-500" />
                        Explore Features
                    </button>
                </div>

                {/* Stats / Trust (replacing Logos) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16 border-t border-gray-100 pt-12">
                    <div>
                        <div className="text-3xl font-bold text-heading">94%</div>
                        <div className="text-sm text-gray-500 font-medium mt-1">Model Accuracy</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-heading">24/7</div>
                        <div className="text-sm text-gray-500 font-medium mt-1">Market Monitoring</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-heading">150+</div>
                        <div className="text-sm text-gray-500 font-medium mt-1">Supported Assets</div>
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-heading">&lt;1s</div>
                        <div className="text-sm text-gray-500 font-medium mt-1">Data Latency</div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default Hero;
