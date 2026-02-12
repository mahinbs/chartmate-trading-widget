import React from 'react';

const Testimonial = () => {
    return (
        <section className="py-24 bg-white">
            <div className="container-custom">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-xl md:text-2xl font-bold font-heading text-heading leading-tight mb-8">
                        “They never fail to deliver. Future clients should trust them and take advantage of their extensive knowledge and expertise.”
                    </h2>

                    <div className="flex flex-col items-center">
                        <span className="text-heading font-bold text-base mb-1">Technical Project Manager</span>
                        <span className="text-gray-500 text-base">Vermont Mutual</span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Testimonial;
