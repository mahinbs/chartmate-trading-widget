import React, { useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

const WorkSlider = () => {
    const swiperRef = useRef<any>(null);

    const caseStudies = [
        {
            id: 1,
            client: "WHOOP",
            title: "Building an Engine for Third-Party Integrations",
            tech: "React + Next.js",
            description: "WHOOP was growing fast, and their engineering team faced a backlog of third-party integrations. We stepped in as an extension of their team, building a robust testing application, and creating self-service documentation.",
            description2: "By taking on these integrations, we freed up WHOOP's engineers to focus on scaling their core product while creating a smooth experience for their partners.",
            image: "https://images.unsplash.com/photo-1605077512719-0788ad1212bb?fm=jpg&q=80&w=1080&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8Zml0bmVzcyUyMHRyYWNrZXIlMjBhcHAlMjBkYXJrfGVufDB8fDB8fHww",
            tag: "Integrate",
            tagIcon: (
                <svg className="w-4 h-4 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
            )
        },
        {
            id: 2,
            client: "KOLIDE",
            title: "User-First Security for the Modern Workplace",
            tech: "React + Ruby on Rails",
            description: "Kolide needed a partner to help them build a new kind of security product. One that puts users first. We worked with them to build a cross-platform agent and a web dashboard that helps IT teams communicate with employees to fix security issues.",
            description2: "The result is a security tool that people actually like using, and that helps organizations achieve 100% fleet compliance without heavy-handed tactics.",
            image: "https://images.unsplash.com/photo-1611328573001-13cf452dd8a9?fm=jpg&q=80&w=1080&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8Zml0bmVzcyUyMHRyYWNrZXIlMjBhcHAlMjBkYXJrY3liZXJzZWN1cml0eSUyMGRhc2hib2FyZHxlbnwwfHwwfHx8MA%3D%3D",
            tag: "Embed",
            tagIcon: (
                <svg className="w-4 h-4 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
            )
        },
        {
            id: 3,
            client: "AARP",
            title: "Digital Transformation for a Legacy Brand",
            tech: "React + Node.js",
            description: "AARP wanted to modernize their digital presence and provide more value to their members. We helped them build a suite of new digital tools and services, including a new membership portal and a personalized content feed.",
            description2: "These new tools have helped AARP engage with a younger demographic and provide more relevant content to their existing members.",
            image: "https://images.unsplash.com/photo-1689951993116-28ed5c41241c?fm=jpg&q=80&w=1080&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8Zml0bmVzcyUyMHRyYWNrZXIlMjBhcHAlMjBkYXJrY3liZXJzZWN1cml0eSUyMGRhc2hib2FyZHNlbmlvciUyMGNpdGl6ZW4lMjB0YWJsZXQlMjBoYXBweXxlbnwwfHwwfHx8MA%3D%3D",
            tag: "Scale",
            tagIcon: (
                <svg className="w-4 h-4 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            )
        }
    ];

    return (
        <section className="py-24 px-7 bg-white">
            <div className="container-custom !bg-[#181b22] overflow-hidden py-16 !px-14 rounded-xl">

                {/* Header with Navigation */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold font-heading mb-6 md:mb-0 text-white">
                        Our Work In The Wild
                    </h2>

                    <div className="flex space-x-4">
                        <button
                            onClick={() => swiperRef.current?.slidePrev()}
                            className="w-12 h-12 rounded border border-gray-600 flex items-center justify-center hover:bg-gray-800 transition-colors"
                            aria-label="Previous slide"
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                        <button
                            onClick={() => swiperRef.current?.slideNext()}
                            className="w-12 h-12 rounded border border-gray-600 flex items-center justify-center hover:bg-gray-800 transition-colors"
                            aria-label="Next slide"
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                </div>

                {/* Slider Track */}
                <Swiper
                    modules={[Navigation]}
                    spaceBetween={30}
                    slidesPerView={1.2}
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
                                    <div className="lg:w-[45%] relative p-6">
                                        <div className="relative w-full h-full rounded-2xl overflow-hidden aspect-[3/4]">
                                            <img src={study.image} alt={study.title} className="w-full h-full object-cover" />
                                        </div>
                                    </div>

                                    {/* Content Side */}
                                    <div className="lg:w-[55%] p-8 md:p-10 flex flex-col justify-center h-full">
                                        <h3 className="text-3xl md:text-4xl font-bold font-heading text-heading mb-6 leading-tight">
                                            {study.title}
                                        </h3>
                                        <p className="text-gray-500 text-base leading-relaxed mb-8">
                                            {study.description}
                                        </p>
                                        <div>
                                            <a href="#" className="inline-flex items-center text-heading font-bold text-base hover:text-primary transition-colors group">
                                                Check Out The Case Study
                                                <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                            </a>
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
