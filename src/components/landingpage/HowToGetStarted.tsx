import React from 'react';

const HowToGetStarted = () => {
    return (
        <section className="py-24 px-7 bg-white">
            <div className="container-custom !max-w-6xl !bg-[#f4f2f0] rounded-xl p-10">
                <div className="grid md:grid-cols-[25%,1fr] gap-12 lg:gap-24">

                    {/* Left Column */}
                    <div className="flex flex-col items-start">
                        <div>
                            <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading leading-[1.1] mb-12 tracking-tight text-[#181B22]">
                                How to Get<br />
                                Started with<br />
                                The Gnar
                            </h2>
                        </div>

                        <div className="mb-8 lg:mb-0">
                            <a
                                href="#contact"
                                className="inline-block bg-primary text-white font-bold py-4 px-8 rounded shadow-primary-hover hover:shadow-primary-hover hover:translate-y-[2px] transition-all text-base"
                            >
                                Let's Build Together
                            </a>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="relative pl-5 lg:pl-8 border-l-[3px] border-primary">
                        <div className="space-y-6">

                            {/* Step 1 */}
                            <div>
                                <h3 className="text-[1.25rem] font-bold text-primary mb-3 text-[#181B22]">Step 1. We Collaborate</h3>
                                <p className="text-[#52525b] text-base leading-relaxed">
                                    Our process always starts with a deep dive into your goals, challenges, and objectives. Basically, we get down to the problems holding you up - and start to create a plan to break through the bottlenecks.
                                </p>
                            </div>

                            {/* Step 2 */}
                            <div>
                                <h3 className="text-[1.25rem] font-bold text-primary mb-3">Step 2. We Design</h3>
                                <p className="text-[#52525b] text-base leading-relaxed">
                                    We take what we've learned and translate it into actionable designs and strategy. From wireframes to architecture, this phase helps us tailor your solution to your exact needs - so it's right the first time.
                                </p>
                            </div>

                            {/* Step 3 */}
                            <div>
                                <h3 className="text-[1.25rem] font-bold text-primary mb-3">Step 3. We Execute & Optimize</h3>
                                <p className="text-[#52525b] text-base leading-relaxed">
                                    Now the real fun begins. Our team works with you to develop, deploy, and optimize your software solution. We work fast but don't cut corners - so your solution is ready to launch, and fast.
                                </p>
                            </div>

                            {/* Footer Text */}
                            <div className="pt-2">
                                <p className="text-[#52525b] text-base">
                                    Ready to take the first step? Let's find time to chat.
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
