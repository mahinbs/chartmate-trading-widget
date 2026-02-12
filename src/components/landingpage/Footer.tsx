import React from 'react';

const Footer = () => {
    return (
        <footer className="text-white pt-24 pb-8 px-7 relative overflow-hidden bg-white">
            <div className="container-custom !bg-[#181b22] relative z-10 p-10 rounded-xl">
                <div className="flex flex-col lg:flex-row gap-16 lg:gap-32">

                    {/* Left Column: Brand & CTA */}
                    <div className="lg:w-[45%]">
                        <h2 className="text-2xl md:text-3xl font-bold font-heading leading-[1.1] mb-8 text-white">
                            The Gnar is a fire-<br />
                            breathing, Boston-based<br />
                            software consultancy<br />
                            made of problem-solvers.
                        </h2>
                        <div className="space-y-6 mb-10 max-w-xl">
                            <p className="text-gray-400 text-base leading-relaxed font-semibold">
                                Whether you're starting from scratch or want to upgrade a feature, we can help.
                            </p>
                            <p className="text-gray-400 text-base leading-relaxed">
                                Bring vision to life with a dedicated team, bug-free code, and a process that's built for speed and scalability.
                            </p>
                        </div>
                        <a
                            href="#contact"
                            className="inline-block bg-primary text-white font-bold py-4 px-8 rounded shadow-primary-hover hover:shadow-primary-hover hover:translate-y-[2px] transition-all text-base"
                        >
                            Let's Build Together
                        </a>
                    </div>

                    {/* Right Column: Links */}
                    <div className="lg:w-[55%] flex flex-col justify-between">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">

                            {/* Services */}
                            <div>
                                <h4 className="font-bold text-white mb-6">Services</h4>
                                <ul className="space-y-3 text-gray-400">
                                    <li><a href="#" className="hover:text-white transition-colors">Gnar AI Spark</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Gnar Ideate</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Gnar Ignite</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Gnar Embed</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Gnar Integrate</a></li>
                                </ul>
                            </div>

                            {/* Technologies */}
                            <div>
                                <h4 className="font-bold text-white mb-6">Technologies</h4>
                                <ul className="space-y-3 text-gray-400">
                                    <li><a href="#" className="hover:text-white transition-colors">Web Development</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Mobile Development</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">UI/UX Design</a></li>
                                </ul>
                            </div>

                            {/* Company */}
                            <div>
                                <h4 className="font-bold text-white mb-6">Company</h4>
                                <ul className="space-y-3 text-gray-400">
                                    <li><a href="#" className="hover:text-white transition-colors">Our Work</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                                    <li><a href="#" className="hover:text-white transition-colors">Schedule Meeting</a></li>
                                </ul>
                            </div>

                            {/* Resources */}
                            <div>
                                <h4 className="font-bold text-white mb-6">Resources</h4>
                                <ul className="space-y-3 text-gray-400">
                                    <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                                </ul>
                            </div>
                        </div>

                        {/* Bottom Section of Right Column */}
                        <div className="flex flex-col md:flex-row justify-between items-end">
                            <div className="mb-8 md:mb-0">
                                <div className="bg-white rounded px-3 py-1 inline-flex items-center space-x-1 mb-8">
                                    <span className="font-bold text-black text-sm">Chartmate</span>
                                    <div className="flex text-primary">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <svg key={star} className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-gray-500 text-sm max-w-sm leading-relaxed">
                                    The Gnar is a U.S.-based software development partner that delivers scalable, production-ready code to help businesses overcome technical challenges and grow with confidence.
                                </p>
                            </div>

                            <div className="flex space-x-4">
                                <a href="#" className="bg-gray-700 hover:bg-gray-600 p-2 rounded transition-colors">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                </a>
                                <a href="#" className="bg-gray-700 hover:bg-gray-600 p-2 rounded transition-colors">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tiger Graphic */}
            {/* <div className="absolute bottom-0 right-0 w-64 h-64 opacity-20 pointer-events-none">
                <img src="https://images.unsplash.com/photo-1638214394146-2b1d57176f8a?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8dGlnZXIlMjBpbGx1c3RyYXRpb24lMjBibGFjayUyMGFuZCUyMHdoaXRlfGVufDB8fDB8fHww" alt="Tiger Illustration" className="w-full h-full object-contain grayscale invert" />
            </div> */}

            {/* Copyright Bar */}
            <div className="container-custom pt-3 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
                <p>&copy; {new Date().getFullYear()} The Gnar Co. Inc | 117 Kendrick Street, Suite 300 | Needham, MA 02494</p>
                <div className="flex space-x-6 mt-4 md:mt-0">
                    <a href="#" className="hover:text-white transition-colors">Privacy & Cookie Policy</a>
                    <a href="#" className="hover:text-white transition-colors">Sitemap</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
