import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

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

    const scrollToSection = (sectionId: string) => {
        setIsMobileMenuOpen(false);

        // If we're not on the home page, navigate to home first
        if (location.pathname !== '/') {
            navigate('/', { state: { scrollTo: sectionId } });
            return;
        }

        // Standard smooth scrolling
        const element = document.getElementById(sectionId);
        if (element) {
            const headerOffset = 80; // Approximate navbar height
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    };

    // Handle initial navigation with scroll state
    useEffect(() => {
        if (location.state && (location.state as any).scrollTo) {
            const sectionId = (location.state as any).scrollTo;
            // Small timeout to allow page to render
            setTimeout(() => {
                scrollToSection(sectionId);
                // Clear state
                window.history.replaceState({}, document.title);
            }, 100);
        }
    }, [location]);

    interface NavLinkProps {
        to: string;
        children: React.ReactNode;
        hasDropdown?: boolean;
    }

    const NavLink: React.FC<NavLinkProps> = ({ to, children, hasDropdown }) => (
        <Link to={to} className="text-heading hover:text-primary font-medium transition-colors flex items-center gap-1 text-sm">
            {children}
            {hasDropdown && (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            )}
        </Link>
    );

    const ScrollLink = ({ to, children }: { to: string, children: React.ReactNode }) => (
        <button
            onClick={() => scrollToSection(to)}
            className="text-heading hover:text-primary font-medium transition-colors flex items-center gap-1 text-sm bg-transparent border-none cursor-pointer"
        >
            {children}
        </button>
    );

    const MobileScrollLink = ({ to, children }: { to: string, children: React.ReactNode }) => (
        <button
            onClick={() => scrollToSection(to)}
            className="text-heading font-medium text-left bg-transparent border-none cursor-pointer"
        >
            {children}
        </button>
    );

    return (
        <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white shadow-sm py-4' : 'bg-white/90 backdrop-blur-sm py-5'}`}>
            <div className="container-custom flex justify-between items-center">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <span className="text-2xl font-bold font-heading text-heading tracking-widest uppercase">Chartmate</span>
                </Link>

                {/* Desktop Menu */}
                <div className="hidden md:flex items-center space-x-8">
                    {/* <ScrollLink to="features">Features</ScrollLink>
                    <NavLink to="/intraday">Intraday</NavLink>
                    <NavLink to="/predictions">Predictions</NavLink>
                    <ScrollLink to="testimonials">Testimonials</ScrollLink>
                    <ScrollLink to="faq">FAQ</ScrollLink> */}
                    <Link to="/predict" className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded text-sm font-bold transition-colors shadow-sm">
                        Launch App
                    </Link>
                </div>

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-heading focus:outline-none"
                    >
                        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-white absolute top-full left-0 w-full shadow-lg py-4 px-4 flex flex-col space-y-4 border-t">
                    <MobileScrollLink to="features">Features</MobileScrollLink>
                    <Link to="/intraday" className="text-heading font-medium" onClick={() => setIsMobileMenuOpen(false)}>Intraday</Link>
                    <Link to="/predictions" className="text-heading font-medium" onClick={() => setIsMobileMenuOpen(false)}>Predictions</Link>
                    <MobileScrollLink to="testimonials">Testimonials</MobileScrollLink>
                    <MobileScrollLink to="faq">FAQ</MobileScrollLink>
                    <Link to="/predict" className="bg-primary text-white py-3 rounded text-center font-bold" onClick={() => setIsMobileMenuOpen(false)}>Launch App</Link>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
