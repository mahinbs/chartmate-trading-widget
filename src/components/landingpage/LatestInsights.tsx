import React from 'react';

const LatestInsights = () => {
    const insights = [
        {
            id: 1,
            category: "Engineering Insights",
            title: "Turbo-powered Dynamic Fields",
            description: "Render parts of your views so your users get the right options at the right times, and do it with as little front-end effort as necessary.",
            image: "https://images.unsplash.com/photo-1641766379322-64e05995e39e?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fHdlYiUyMGJyb3dzZXIlMjBzcGVlZCUyMGxpZ2h0bmluZ3xlbnwwfHwwfHx8MA%3D%3D"
        },
        {
            id: 2,
            category: "Engineering Insights",
            title: "React in Rails, One Component at a Time",
            description: "It seems like we should be able to drop React components into our views on an ad hoc basis using Stimulus, which is exactly what...",
            image: "https://images.unsplash.com/photo-1604225759087-b1d83520c292?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHdlYiUyMGJyb3dzZXIlMjBzcGVlZCUyMGxpZ2h0bmluZ21vdXNlJTIwY29tcHV0ZXIlMjBhcnR8ZW58MHx8MHx8fDA%3D"
        },
        {
            id: 3,
            category: "Engineering Insights",
            title: "A Near Miss: How I Froze My Website by Adding a Generated Column",
            description: "Do avoid freezing your database, don't create a generated column. Add a nullable column, a trigger to update its value, and a job to backfi...",
            image: "https://images.unsplash.com/photo-1762779886309-b680cd4a9be8?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHdlYiUyMGJyb3dzZXIlMjBzcGVlZCUyMGxpZ2h0bmluZ21vdXNlJTIwY29tcHV0ZXIlMjBhcnRob3VyZ2xhc3MlMjByZXRybyUyMGNvbXB1dGVyfGVufDB8fDB8fHww"
        }
    ];

    return (
        <section className="py-24 bg-white">
            <div className="container-custom">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-16">
                    <h2 className="text-huge md:text-text-4xl lg:text-4xl font-bold font-heading text-heading">
                        Latest Insights
                    </h2>
                    <a href="#insights" className="hidden md:inline-block border border-primary text-primary font-bold py-4 px-8 rounded hover:bg-primary hover:text-white transition-colors text-base">
                        See More Insights
                    </a>
                </div>

                {/* Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
                    {insights.map((insight) => (
                        <div key={insight.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-white flex flex-col h-full group">
                            <div className="p-8 pb-0">
                                <span className="text-gray-500 text-sm font-semibold mb-4 block uppercase tracking-wider">{insight.category}</span>
                            </div>
                            <div className="px-8">
                                <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-100">
                                    <img src={insight.image} alt={insight.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                            </div>
                            <div className="p-8 flex-grow flex flex-col">
                                <h3 className="text-2xl font-bold font-heading text-heading mb-4 leading-tight">
                                    {insight.title}
                                </h3>
                                <p className="text-gray-500 text-base leading-relaxed mb-6 flex-grow">
                                    {insight.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Mobile Button */}
                <div className="mt-12 md:hidden text-center">
                    <a href="#insights" className="inline-block border border-primary text-primary font-bold py-3 px-6 rounded hover:bg-primary hover:text-white transition-colors">
                        See More Insights
                    </a>
                </div>

            </div>
        </section>
    );
};

export default LatestInsights;
