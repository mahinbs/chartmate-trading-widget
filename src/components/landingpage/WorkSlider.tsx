import React, { useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const WorkSlider = () => {
    const swiperRef = useRef<any>(null);

    const caseStudies = [
        {
            id: 1,
            client: "BTC/USD",
            title: "Capturing the Bitcoin Breakout",
            tech: "15m Timeframe",
            description: "Our multi-horizon AI model identified a high-probability accumulation pattern 5 hours before the massive 8% surge. Users utilizing the 'Aggressive' risk profile received an early entry signal, maximizing their upside.",
            image: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=1000",
        },
        {
            id: 2,
            client: "NVDA",
            title: "Protecting Capital on Tech Reversals",
            tech: "Daily Timeframe",
            description: "While retail sentiment was maximum bullish, ChartMate's sentiment analysis diverged, identifying a top with 94% confidence. This alert helped thousands of traders lock in profits before the 12% correction.",
            image: "https://images.unsplash.com/photo-1591696205602-2f950c417cb9?auto=format&fit=crop&q=80&w=1000",
        },
        {
            id: 3,
            client: "EUR/USD",
            title: "Riding the Institutional Trend",
            tech: "4h Timeframe",
            description: "Forex markets are noisy. Our volume profile analysis filtered out the noise to identify true institutional order flow, allowing trend followers to catch the entire 300-pip move with trailing stops.",
            image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1000",
        }
    ];

    return (
        <section className="py-24 px-4 md:px-7 bg-white">
            <div className="container-custom !bg-[#181b22] overflow-hidden py-16 !px-8 md:!px-14 rounded-3xl">

                {/* Header with Navigation */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading mb-6 md:mb-0 text-white leading-tight">
                        See The AI In Action
                    </h2>

                    <div className="flex space-x-4">
                        <button
                            onClick={() => swiperRef.current?.slidePrev()}
                            className="w-12 h-12 rounded-full border border-gray-600 flex items-center justify-center hover:bg-gray-800 transition-colors text-white"
                            aria-label="Previous slide"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                        <button
                            onClick={() => swiperRef.current?.slideNext()}
                            className="w-12 h-12 rounded-full border border-gray-600 flex items-center justify-center hover:bg-gray-800 transition-colors text-white"
                            aria-label="Next slide"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                </div>

                {/* Slider Track */}
                <Swiper
                    modules={[Navigation]}
                    spaceBetween={30}
                    slidesPerView={1}
                    breakpoints={{
                        768: {
                            slidesPerView: 1.2,
                        }
                    }}
                    onBeforeInit={(swiper: any) => {
                        swiperRef.current = swiper;
                    }}
                    loop={true}
                    className="w-full"
                >
                    {caseStudies.map((study) => (
                        <SwiperSlide key={study.id}>
                            <div className="w-full h-full">
                                <div className="bg-white rounded-3xl overflow-hidden flex flex-col lg:flex-row min-h-[500px] h-full">

                                    {/* Image Side */}
                                    <div className="lg:w-[45%] relative p-4 md:p-6 lg:border-r border-gray-100">
                                        <div className="relative w-full h-full rounded-2xl overflow-hidden min-h-[300px]">
                                            <img src={study.image} alt={study.title} className="w-full h-full object-cover absolute inset-0" />
                                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-heading shadow-sm">
                                                {study.client}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content Side */}
                                    <div className="lg:w-[55%] p-8 md:p-12 flex flex-col justify-center h-full">
                                        <div className="flex items-center space-x-2 mb-6">
                                            <TrendingUp className="w-5 h-5 text-primary" />
                                            <span className="text-primary font-bold text-sm uppercase tracking-wider">{study.tech}</span>
                                        </div>

                                        <h3 className="text-2xl md:text-3xl font-bold font-heading text-heading mb-6 leading-tight">
                                            {study.title}
                                        </h3>
                                        <p className="text-gray-500 text-lg leading-relaxed mb-10">
                                            {study.description}
                                        </p>
                                        <div>
                                            <Link to="/predict" className="inline-flex items-center text-heading font-bold text-base hover:text-primary transition-colors group">
                                                Analyze This Asset
                                                <ArrowRight className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" />
                                            </Link>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>

            </div>
        </section>
    );
};

export default WorkSlider;
