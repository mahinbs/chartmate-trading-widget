import React, { useState, useEffect } from 'react';

const Services = () => {
    const [typingLines, setTypingLines] = useState<number[]>([20, 40, 60, 30, 50, 70]);
    const [speed, setSpeed] = useState<number>(0);
    const [isLaunched, setIsLaunched] = useState<boolean>(false);

    // Simulate code typing effect
    useEffect(() => {
        const interval = setInterval(() => {
            setTypingLines(prev => prev.map(() => Math.floor(Math.random() * 60 + 20)));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Handle mouse move for speedometer interaction
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isLaunched) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        // Calculate speed based on horizontal mouse position (0 to 100)
        const newSpeed = Math.min(Math.max((x / width) * 100, 0), 100);
        setSpeed(newSpeed);
    };

    const handleLaunch = () => {
        setIsLaunched(true);
        setSpeed(100); // Max speed on launch
        setTimeout(() => setIsLaunched(false), 3000); // Reset after 3 seconds
    };

    return (
        <section id="services" className="py-24 bg-white overflow-hidden">
            <div className="container-custom">
                <div className="flex flex-col lg:flex-row items-center gap-16">

                    {/* Left Content */}
                    <div className="lg:w-1/2">
                        <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading mb-8 leading-tight">
                            We Accelerate Your Product Development
                        </h2>
                        <p className="text-base text-gray-600 mb-6 leading-relaxed">
                            The Gnar is your integrated software partner, injecting rocket fuel into your development engine. With decades of enterprise-level experience, we help transform your ideas into market-ready solutions faster.
                        </p>
                        <p className="text-base text-gray-600 mb-10 leading-relaxed">
                            Our collaborative approach means we're not just writing code – we're thinking through solutions, spotting opportunities, and actively working to accelerate your path to market.
                        </p>
                        <a href="#contact" className="inline-block bg-primary hover:bg-primary-hover text-white text-base font-bold px-8 py-4 rounded shadow-md transition-transform transform hover:-translate-y-1">
                            Get Reliable Software Built For Growth
                        </a>
                    </div>

                    {/* Right Graphic (Interactive Code Editor) */}
                    <div
                        className="lg:w-1/2 w-full relative perspective-1000"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => !isLaunched && setSpeed(0)}
                    >
                        {/* Decorative border line */}
                        <div className="absolute -inset-4 border border-primary/30 rounded-xl z-0 hidden md:block transition-all duration-500"
                            style={{ transform: `rotate(${speed * 0.05}deg)` }}></div>

                        {/* Main Editor Window */}
                        <div className="relative z-10 bg-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden border border-gray-800 transition-transform duration-300 ease-out"
                            style={{ transform: `rotateY(${speed * 0.1 - 5}deg) rotateX(${speed * 0.05 - 2.5}deg)` }}>
                            {/* Window Header */}
                            <div className="bg-[#2d2d2d] px-4 py-3 flex items-center space-x-2 border-b border-gray-700">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <div className="ml-4 text-xs text-gray-400 font-mono flex items-center">
                                    Lightning Speed Development
                                    {isLaunched && <span className="ml-2 text-green-500 animate-pulse">● LIVE</span>}
                                </div>
                            </div>

                            {/* Code Area */}
                            <div className="p-6 space-y-3 font-mono text-sm h-[300px] overflow-hidden">
                                {/* Simulated Code Lines */}
                                <div className="flex space-x-2">
                                    <div className="w-8 h-4 bg-gray-700 rounded opacity-50"></div>
                                    <div className="w-24 h-4 bg-purple-500 rounded opacity-70"></div>
                                    <div className="w-32 h-4 bg-blue-500 rounded opacity-70"></div>
                                </div>
                                <div className="w-3/4 h-4 bg-gray-600 rounded opacity-30 ml-8"></div>
                                <div className="w-1/2 h-4 bg-gray-600 rounded opacity-30 ml-8"></div>

                                <div className="flex space-x-2 mt-4">
                                    <div className="w-12 h-4 bg-yellow-600 rounded opacity-70"></div>
                                    <div className="w-20 h-4 bg-green-500 rounded opacity-70"></div>
                                </div>

                                {/* Dynamic Typing Lines */}
                                <div className="space-y-2 mt-4 transition-all duration-300">
                                    {typingLines.map((width, i) => (
                                        <div key={i} className="flex items-center space-x-2 ml-4">
                                            <div
                                                className={`h-3 rounded opacity-30 ${isLaunched ? 'bg-green-500/50' : 'bg-gray-600'} transition-all duration-500`}
                                                style={{ width: `${width}%` }}
                                            ></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Floating Elements (Speedometer & Launch Badge) */}
                            <div className="absolute top-10 right-10 bg-[#252526] p-4 rounded-xl border border-gray-700 shadow-lg w-40 transition-transform hover:scale-105">
                                {/* Simple CSS Speedometer */}
                                <div className="relative w-32 h-16 overflow-hidden mx-auto">
                                    <div className="absolute top-0 left-0 w-32 h-32 rounded-full border-8 border-gray-700 border-t-primary border-r-primary transform -rotate-45"></div>
                                    {/* Needle */}
                                    <div
                                        className="absolute bottom-0 left-1/2 w-1 h-16 bg-red-500 origin-bottom transition-transform duration-300 ease-out"
                                        style={{ transform: `translateX(-50%) rotate(${speed * 1.8 - 90}deg)` }}
                                    ></div>
                                    <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-white rounded-full transform -translate-x-1/2 translate-y-1/2"></div>
                                </div>
                                <div className="text-center text-xs text-primary mt-2 font-bold tracking-widest">
                                    VELOCITY: {Math.round(speed)}%
                                </div>
                            </div>

                            <button
                                onClick={handleLaunch}
                                className={`absolute bottom-6 right-6 px-6 py-3 rounded-lg border shadow-xl flex items-center space-x-3 transition-all duration-300 ${isLaunched ? 'bg-green-600 border-green-400 scale-110' : 'bg-[#2d2d2d] border-gray-600 hover:bg-[#3d3d3d]'}`}
                            >
                                <span className="text-white font-bold tracking-[0.3em] text-sm">
                                    {isLaunched ? 'LAUNCHED!' : 'LAUNCH'}
                                </span>
                                <div className={`w-2 h-2 rounded-full ${isLaunched ? 'bg-white animate-ping' : 'bg-green-500 animate-pulse'}`}></div>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};

export default Services;
