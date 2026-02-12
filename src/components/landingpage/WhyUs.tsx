import React from 'react';

const WhyUs = () => {
    const logos = [
        "AARP", "KOLIDE", "Optimizely", "Mass General Brigham", "WHOOP", "systemone", "SALSIFY"
    ];

    const scrollingLogos = [...logos, ...logos, ...logos];

    return (
        <section className="py-20 bg-white relative overflow-hidden">
            {/* Grid Background */}
            <div className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    backgroundImage: `
            linear-gradient(to right, #f9f9f9 1px, transparent 1px),
            linear-gradient(to bottom, #f9f9f9 1px, transparent 1px)
          `,
                    backgroundSize: '80px 80px'
                }}
            ></div>

            <div className="container-custom relative z-10">

                {/* Top Section: Brands Trust */}
                <div className="flex flex-col lg:flex-row items-center mb-24">
                    <div className="lg:w-1/4 mb-8 lg:mb-0">
                        <h3 className="text-2xl font-bold font-heading text-heading leading-tight">
                            Top Brands Trust<br />
                            The Gnar To Get It Done
                        </h3>
                    </div>

                    <div className="lg:w-3/4 w-full">
                        <div className="bg-[#181b22] rounded-xl p-8 overflow-hidden flex items-center relative">
                            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#181b22] to-transparent z-10"></div>
                            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#181b22] to-transparent z-10"></div>

                            <div className="flex space-x-12 animate-scroll whitespace-nowrap">
                                {scrollingLogos.map((logo, index) => (
                                    <div key={index} className="text-white font-bold text-xl opacity-80 hover:opacity-100 transition-opacity">
                                        {logo}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Gnarly Problem Form & Cards */}
                <div className="bg-[#f9f7f6] rounded-3xl p-8 md:p-20">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold font-heading text-heading mb-12 tracking-tight">
                            What's Your Gnarly Problem?
                        </h2>

                        <div className="max-w-2xl mx-auto space-y-4">
                            <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xl md:text-2xl text-content font-medium">
                                <span className="whitespace-nowrap">I'm a</span>
                                <div className="relative w-full md:w-80">
                                    <select className="block w-full appearance-none bg-white border border-primary/30 hover:border-primary/50 px-4 py-3 pr-8 rounded shadow-sm leading-tight focus:outline-none focus:ring-2 focus:ring-primary/20 text-base font-normal text-gray-700">
                                        <option>Select an option</option>
                                        <option>Startup Founder</option>
                                        <option>Product Manager</option>
                                        <option>CTO / VP of Eng</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xl md:text-2xl text-content font-medium">
                                <span className="whitespace-nowrap">that has</span>
                                <div className="relative w-full md:w-80">
                                    <select className="block w-full appearance-none bg-white border border-primary/30 hover:border-primary/50 px-4 py-3 pr-8 rounded shadow-sm leading-tight focus:outline-none focus:ring-2 focus:ring-primary/20 text-base font-normal text-gray-700">
                                        <option>Select an option</option>
                                        <option>An Idea</option>
                                        <option>A Prototype</option>
                                        <option>Legacy Code</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Card 1: Gnar Ideate */}
                        <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="h-64 bg-[#181b22] relative flex items-center justify-center overflow-hidden group">
                                {/* Simulated App Flow Graphic */}
                                <div className="relative w-full h-full p-8 flex items-center justify-center">
                                    <div className="w-32 h-48 bg-gray-800 rounded-2xl border-2 border-gray-700 relative z-10 transform group-hover:scale-105 transition-transform">
                                        <div className="absolute top-4 left-4 right-4 h-2 bg-gray-600 rounded"></div>
                                        <div className="absolute top-8 left-4 right-4 h-20 bg-gray-700 rounded"></div>
                                        <div className="absolute bottom-4 left-1/2 w-8 h-8 bg-primary rounded-full transform -translate-x-1/2 flex items-center justify-center text-white font-bold text-xs">$</div>
                                    </div>
                                    {/* Connecting lines */}
                                    <div className="absolute top-1/2 left-1/4 w-16 h-0.5 bg-primary"></div>
                                    <div className="absolute top-1/3 right-1/4 w-16 h-0.5 bg-primary transform rotate-45"></div>
                                    <div className="absolute top-10 right-10 w-12 h-16 border border-gray-600 rounded opacity-50"></div>
                                    <div className="absolute bottom-10 left-10 w-24 h-12 bg-gray-800 rounded border border-gray-700"></div>
                                </div>
                            </div>
                            <div className="p-8">
                                <span className="text-primary font-bold text-sm uppercase tracking-wider mb-2 block">Gnar Ideate</span>
                                <h3 className="text-xl font-bold font-heading text-heading mb-4">
                                    Let's Get That Great Idea Into a Working Product
                                </h3>
                                <p className="text-gray-600 leading-relaxed mb-6">
                                    You've got a vision but need help getting started. Gnar Ideate transforms your concept into a clickable prototype, guiding you through user journeys, wireframes, and a development estimate. This 5-step process begins with a Discovery Workshop to refine your idea - and over a 2-month sprint, we bring it to life!
                                </p>
                            </div>
                        </div>

                        {/* Card 2: Gnar Ignite */}
                        <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="h-64 bg-[#181b22] relative flex items-center justify-center overflow-hidden group">
                                {/* Simulated Rocket Graphic */}
                                <div className="relative w-full h-full p-8 flex items-center justify-center">
                                    <div className="w-32 h-32 bg-primary/20 rounded-full absolute animate-pulse"></div>
                                    <div className="w-24 h-24 bg-primary rounded-xl flex items-center justify-center transform rotate-45 group-hover:rotate-0 transition-transform duration-500 relative z-10 border-2 border-white/20">
                                        <svg className="w-12 h-12 text-white transform -rotate-45 group-hover:rotate-0 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    {/* Labels */}
                                    <div className="absolute bottom-6 left-0 right-0 flex justify-center space-x-4 text-[10px] text-gray-400 font-mono uppercase tracking-widest">
                                        <span className="flex items-center"><span className="w-2 h-2 bg-primary rounded-full mr-1"></span>Clean Codebase</span>
                                        <span className="flex items-center"><span className="w-2 h-2 bg-primary rounded-full mr-1"></span>Agile Dev</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-8">
                                <span className="text-primary font-bold text-sm uppercase tracking-wider mb-2 block">Gnar Ignite</span>
                                <h3 className="text-xl font-bold font-heading text-heading mb-4">
                                    Ready to Build? Let's Launch Your Product
                                </h3>
                                <p className="text-gray-600 leading-relaxed mb-6">
                                    You're ready to bring your product to life - but how do you get it there? Gnar Ignite is how we help build and launch your products to market. We set up a foundational codebase, grounded in best practices, and follow an agile development process to build a scalable product (and we do it fast!)
                                </p>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Features Section (Dark Box) */}
                <div className="mt-24 relative bg-[#181b22] rounded-3xl overflow-hidden grid lg:grid-cols-[25%,1fr]">

                    {/* Left Side (Title & Button) */}
                    <div className="relative z-10 p-10 lg:p-16 flex flex-col justify-between">
                        <div>
                            <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-white mb-8">Why Gnar?</h2>
                            <p className="text-gray-400 text-lg leading-relaxed mb-10">
                                We stand behind our work - which is why 250+ brands, organizations, and businesses choose us to help them bring their ideas to life.
                            </p>
                        </div>

                        {/* Cutout Button Area */}
                        <div className="hidden lg:flex absolute bottom-0 left-0 bg-white w-full h-32 rounded-tr-[3rem] items-center px-16">
                            <a href="#start" className="bg-primary hover:bg-primary-hover text-white font-bold py-4 px-8 rounded shadow-lg transform hover:-translate-y-1 transition-transform">
                                Let's Get Started
                            </a>
                        </div>

                        {/* Mobile Button */}
                        <div className="lg:hidden mt-8">
                            <a href="#start" className="inline-block bg-primary hover:bg-primary-hover text-white font-bold py-4 px-8 rounded shadow-lg">
                                Let's Get Started
                            </a>
                        </div>
                    </div>

                    {/* Right Side (Features Grid) */}
                    <div className="p-10 lg:p-12 bg-[#181b22]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">

                            {/* Feature 1 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                                    <h4 className="text-white font-bold text-xl">Dedicated Teams</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    Each developer is dedicated to a single project at a time - so you get a singular focus with no distractions.
                                </p>
                            </div>

                            {/* Feature 2 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    <h4 className="text-white font-bold text-xl">Rapid Delivery</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    We've done this before. Our teams deliver production-ready code within the first week.
                                </p>
                            </div>

                            {/* Feature 3 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    <h4 className="text-white font-bold text-xl">Bug-Free Warranty</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    We're so confident in our work that we'll fix any nonconforming, released code for free, for a year.
                                </p>
                            </div>

                            {/* Feature 4 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    <h4 className="text-white font-bold text-xl">100% U.S.-Based Engineers</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    We believe in a higher velocity, proactive approach with a team that understands your market.
                                </p>
                            </div>

                            {/* Feature 5 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                    <h4 className="text-white font-bold text-xl">Test-Driven Development</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    Our code is covered by a robust suite of automated tests - so updates work as expected and don't break existing features.
                                </p>
                            </div>

                            {/* Feature 6 */}
                            <div>
                                <div className="flex items-center mb-3">
                                    <svg className="w-6 h-6 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                    <h4 className="text-white font-bold text-xl">A Founders Mindset</h4>
                                </div>
                                <p className="text-gray-400 text-base leading-relaxed">
                                    We treat your project like it's our own, focusing on simplicity and scalability for tomorrow's market.
                                </p>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default WhyUs;
