import React from 'react';
import { Link } from 'react-router-dom';
import { ScrollReveal } from '../ui/ScrollReveal';

const Footer = () => {
    return (
        <footer className="text-gray-400 pt-24 pb-8 px-4 md:px-7 relative overflow-hidden bg-black border-t border-white/5">
            <div className="container mx-auto relative z-10 p-10 lg:p-16 rounded-[2.5rem] bg-zinc-950/50 border border-white/5 backdrop-blur-sm">
                <div className="flex flex-col lg:flex-row gap-16 lg:gap-32">

                    {/* Left Column: Brand & CTA */}
                    <div className="lg:w-[45%]">
                        <ScrollReveal>
                            <h2 className="text-3xl md:text-4xl font-black leading-[1.1] mb-8 text-white tracking-tight">
                                our ai probability software<br />
                                Trading Intelligence<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">For The Modern Trader.</span>
                            </h2>
                            <div className="space-y-6 mb-10 max-w-xl">
                                <p className="text-gray-400 text-lg leading-relaxed font-light">
                                    Whether you're a day trader or a long-term investor, our AI gives you the data-driven edge you need.
                                </p>
                            </div>
                            <Link
                                to="/predict"
                                className="inline-block bg-white text-black font-bold py-4 px-8 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all text-base"
                            >
                                Start Analysis Now
                            </Link>
                        </ScrollReveal>
                    </div>

                    {/* Right Column: Links */}
                    <div className="lg:w-[55%] flex flex-col justify-between">
                        <ScrollReveal delay={0.2}>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-16">

                                {/* Product */}
                                <div>
                                    <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-sm">Product</h4>
                                    <ul className="space-y-4 text-gray-400 text-sm">
                                        <li><Link to="/predict" className="hover:text-cyan-400 transition-colors">AI Analysis</Link></li>
                                        <li><Link to="/intraday" className="hover:text-cyan-400 transition-colors">Intraday</Link></li>
                                        <li><Link to="/predictions" className="hover:text-cyan-400 transition-colors">History</Link></li>
                                        <li><Link to="/active-trades" className="hover:text-cyan-400 transition-colors">Track Trades</Link></li>
                                    </ul>
                                </div>

                                {/* Company */}
                                <div>
                                    <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-sm">Company</h4>
                                    <ul className="space-y-4 text-gray-400 text-sm">
                                        <li><Link to="/" className="hover:text-cyan-400 transition-colors">About Us</Link></li>
                                        <li><a href="/#features" className="hover:text-cyan-400 transition-colors">Features</a></li>
                                        <li><a href="/#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a></li>
                                        <li><a href="#" className="hover:text-cyan-400 transition-colors">Contact</a></li>
                                    </ul>
                                </div>

                                {/* Legal */}
                                <div>
                                    <h4 className="font-bold text-white mb-6 uppercase tracking-wider text-sm">Legal</h4>
                                    <ul className="space-y-4 text-gray-400 text-sm">
                                        <li><a href="#" className="hover:text-cyan-400 transition-colors">Privacy Policy</a></li>
                                        <li><a href="#" className="hover:text-cyan-400 transition-colors">Terms of Service</a></li>
                                        <li><a href="#" className="hover:text-cyan-400 transition-colors">Risk Disclaimer</a></li>
                                    </ul>
                                </div>
                            </div>
                        </ScrollReveal>

                        {/* Bottom Section of Right Column */}
                        <ScrollReveal delay={0.4}>
                            <div className="flex flex-col md:flex-row justify-between items-end border-t border-white/5 pt-8">
                                <div className="mb-8 md:mb-0">
                                    <div className="bg-black/50 border border-white/10 rounded-full px-4 py-2 inline-flex items-center space-x-2 mb-6 backdrop-blur-sm">
                                        <span className="font-black text-white text-xs tracking-widest uppercase">our ai probability software</span>
                                        <div className="flex text-cyan-400">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <svg key={star} className="w-3 h-3 fill-current drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-gray-500 text-xs max-w-sm leading-relaxed font-light">
                                        Trading involves high risk. Past performance is not indicative of future results. Information provided is for educational purposes only.
                                    </p>
                                </div>

                                <div className="flex space-x-4">
                                    <a href="#" className="bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 p-2.5 rounded-full transition-all text-gray-400">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                    </a>
                                    <a href="#" className="bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 p-2.5 rounded-full transition-all text-gray-400">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
                                    </a>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </div>
            </div>

            {/* Copyright Bar */}
            <div className="container mx-auto px-4 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-600 text-xs uppercase tracking-widest font-bold">
                <p>&copy; {new Date().getFullYear()} our ai probability software AI. All rights reserved.</p>
                <div className="flex space-x-6 mt-4 md:mt-0">
                    <a href="#" className="hover:text-cyan-400 transition-colors">Privacy</a>
                    <a href="#" className="hover:text-cyan-400 transition-colors">Terms</a>
                    <a href="#" className="hover:text-cyan-400 transition-colors">Sitemap</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
