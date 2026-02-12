import React, { useState, useEffect } from 'react';

const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 10) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    interface NavLinkProps {
        href: string;
        children: React.ReactNode;
        hasDropdown?: boolean;
    }

    const NavLink: React.FC<NavLinkProps> = ({ href, children, hasDropdown }) => (
        <a href={href} className="text-heading hover:text-primary font-medium transition-colors flex items-center gap-1 text-sm">
            {children}
            {hasDropdown && (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            )}
        </a>
    );

    return (
        <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white shadow-sm py-4' : 'bg-white/90 backdrop-blur-sm py-5'}`}>
            <div className="container-custom flex justify-between items-center">
                {/* Logo */}
                <a href="/" className="flex items-center gap-2">
                    <span className="text-2xl font-bold font-heading text-heading tracking-widest uppercase">Chartmate</span>
                </a>

                {/* Desktop Menu */}
                <div className="hidden md:flex items-center space-x-8">
                    <NavLink href="#about">About Us</NavLink>
                    <NavLink href="#services" hasDropdown>Services</NavLink>
                    <NavLink href="#technologies" hasDropdown>Technologies</NavLink>
                    <NavLink href="#blog">Blog</NavLink>
                    <NavLink href="#work">Our Work</NavLink>
                    <a href="#contact" className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded text-sm font-bold transition-colors shadow-sm">
                        Let's Build Together
                    </a>
                </div>

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-heading focus:outline-none"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isMobileMenuOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-white absolute top-full left-0 w-full shadow-lg py-4 px-4 flex flex-col space-y-4 border-t">
                    <a href="#about" className="text-heading font-medium">About Us</a>
                    <a href="#services" className="text-heading font-medium flex justify-between">Services <span>+</span></a>
                    <a href="#technologies" className="text-heading font-medium flex justify-between">Technologies <span>+</span></a>
                    <a href="#blog" className="text-heading font-medium">Blog</a>
                    <a href="#work" className="text-heading font-medium">Our Work</a>
                    <a href="#contact" className="bg-primary text-white py-3 rounded text-center font-bold">Let's Build Together</a>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
