import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useKeenSlider } from "keen-slider/react"
import "keen-slider/keen-slider.min.css"

const testimonials = [
    {
        quote: "I was skeptical about AI tools—most are just hype. But ChartMate's risk management actually kept me out of bad trades during the last correction. It's not magic, but it keeps me disciplined.",
        author: "Lachlan Ross",
        role: "Swing Trader, Melbourne"
    },
    {
        quote: "The probability heatmaps align well with my own technicals. It doesn't replace my analysis, but having that second opinion on entry zones gives me the confidence to size up.",
        author: "Omar Al-Fayed",
        role: "Forex Specialist, Dubai"
    },
    {
        quote: "Impressed by the data integrity. I've backtested their signals against my own historical data and the correlation is significant. reliable infrastructure for serious work.",
        author: "Klaus Weber",
        role: "Algorithmic Trader, Munich"
    },
    {
        quote: "As a scalper, milliseconds matter. The latency on the probability updates is effectively zero. It catches momentum shifts before they hit the mainstream news feeds.",
        author: "James Sterling",
        role: "Institutional Scalper, London"
    },
    {
        quote: "The automation potential is huge. I use the API to feed probability data directly into my execution bot. It's saved me hours of screen time every day.",
        author: "Wei Chen",
        role: "Quant Developer, Singapore"
    },
    {
        quote: "Finally, a trading interface that is clean and intuitive. The risk-reward visualization makes it so easy to see if a trade is worth taking at a glance.",
        author: "Elena Rossi",
        role: "Visual Trader, Toronto"
    }
];

const Testimonial = () => {
    const animation = { duration: 35000, easing: (t: number) => t }
    const [sliderRef] = useKeenSlider<HTMLDivElement>({
        loop: true,
        renderMode: "performance",
        drag: true, // Allow users to drag if they want
        created(s) {
            s.moveToIdx(5, true, animation)
        },
        updated(s) {
            s.moveToIdx(s.track.details.abs + 5, true, animation)
        },
        animationEnded(s) {
            s.moveToIdx(s.track.details.abs + 5, true, animation)
        },
        breakpoints: {
            "(min-width: 768px)": {
                slides: { perView: 2, spacing: 20 },
            },
            "(min-width: 1024px)": {
                slides: { perView: 3, spacing: 30 },
            },
        },
        slides: { perView: 1, spacing: 15 },
    })

    return (
        <section id="testimonials" className="py-24 bg-gray-50 border-t border-black/5 overflow-hidden">
            <div className="">
                <div className="container-custom text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading text-heading mb-4">
                        Trusted by Smart Traders
                    </h2>
                </div>

                <div ref={sliderRef} className="keen-slider py-4">
                    {testimonials.map((item, index) => (
                        <div key={index} className="keen-slider__slide bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center h-auto min-h-[320px]">
                            <div className="flex space-x-1 mb-6">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                                ))}
                            </div>
                            <p className="text-gray-600 text-lg italic mb-6 leading-relaxed flex-grow">
                                "{item.quote}"
                            </p>
                            <div>
                                <h4 className="font-bold text-heading">{item.author}</h4>
                                <span className="text-sm text-gray-500">{item.role}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Testimonial;
