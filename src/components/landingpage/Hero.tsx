import React, { useState, useEffect, useRef } from 'react';

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
        <section className="relative bg-white pt-32 pb-20 lg:pt-40 lg:pb-24 overflow-hidden">
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
                        className="absolute w-[80px] h-[80px] bg-red-50/50 transition-all duration-1000 ease-in-out"
                        style={{
                            top: `${pos.top}px`,
                            left: `${pos.left}px`
                        }}
                    ></div>
                ))}

                {/* Orange Drops */}
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
                <div className="mb-8 bg-white border border-gray-200 rounded-full px-4 py-1 flex items-center shadow-sm">
                    <span className="font-bold text-heading mr-2">Chartmate</span>
                    <div className="flex text-red-500 text-xs">
                        {'★'.repeat(5)}
                    </div>
                </div>

                {/* Sub-headline */}
                <p className="text-gray-500 text-sm md:text-base mb-6">
                    Top Ruby on Rails Developer | Top App Development Company
                </p>

                {/* Main Headline */}
                <h1 className="max-w-5xl text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading leading-[1] mb-6 tracking-tight text-[#181B22]">
                    We're A Product Development Team That Brings High-Velocity Development with High-Impact Results
                </h1>

                {/* Description */}
                <div className="max-w-4xl mx-auto mb-10">
                    <p className="text-xl md:text-2xl text-content mb-4 leading-relaxed">
                        Companies partner with us when they need scalable, bug-free software delivered fast.
                    </p>
                    <p className="text-sm md:text-base text-gray-500 leading-relaxed max-w-4xl mx-auto">
                        Our senior-level U.S.-based product team helps you get to market quickly with high-quality software—reducing long-term costs, maximizing ROI, and maintaining product momentum
                    </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mb-20">
                    <a href="#contact" className="bg-primary hover:bg-primary-hover text-white px-8 py-3 rounded shadow-sm transition-colors">
                        Let's Build Together
                    </a>
                    <a href="#work" className="bg-white border border-gray-300 text-heading px-8 py-3 rounded shadow-sm hover:bg-gray-50 transition-colors">
                        See Our Work
                    </a>
                </div>

                {/* Client Logos */}
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-80 grayscale">
                    {/* Simple text placeholders for logos as per image */}
                    <span className="font-bold text-xl text-gray-600">KOLIDE</span>
                    <span className="font-bold text-xl text-gray-600 italic">Optimizely</span>
                    <span className="font-bold text-xl text-gray-600 tracking-widest">WHOOP</span>
                    <span className="font-bold text-xl text-gray-600">SALSIFY</span>
                    <span className="font-bold text-xl text-gray-600">fitbit</span>
                </div>

            </div>
        </section>
    );
};

export default Hero;
