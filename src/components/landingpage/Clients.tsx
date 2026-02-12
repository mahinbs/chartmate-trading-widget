import React from 'react';

const Clients = () => {
    // Placeholder client names since we don't have the logos
    const clients = [
        "Client 1", "Client 2", "Client 3", "Client 4", "Client 5", "Client 6"
    ];

    return (
        <section className="py-12 border-b border-gray-100">
            <div className="container-custom">
                <p className="text-center text-gray-400 text-sm font-semibold uppercase tracking-wider mb-8">
                    Trusted by innovative companies
                </p>
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                    {clients.map((client, index) => (
                        <div key={index} className="text-xl font-bold text-gray-400 hover:text-primary cursor-default">
                            {client}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Clients;
