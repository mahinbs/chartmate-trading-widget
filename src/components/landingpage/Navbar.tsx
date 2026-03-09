import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [hasBlogs, setHasBlogs] = useState(false);
    const [hasDashboard, setHasDashboard] = useState(false);
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

    // Determine if blogs / dashboard pages should be shown in nav
    useEffect(() => {
        const loadFlags = async () => {
            try {
                const [{ count: blogCount }, { count: dashCount }] = await Promise.all([
                    supabase.from('blogs').select('id', { head: true, count: 'exact' }),
                    supabase.from('public_dashboard_metrics').select('id', { head: true, count: 'exact' }),
                ]);
                setHasBlogs((blogCount ?? 0) > 0);
                setHasDashboard((dashCount ?? 0) > 0);
            } catch (e) {
                console.error('Navbar flags error', e);
            }
        };
        loadFlags();
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
                <Link to="/" className="flex items-center gap-1" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <img src="/boostmysite-logo.png" alt="BoostMySites Logo" className="h-10 w-auto" />
                    <span className="text-2xl font-bold font-heading text-heading tracking-widest uppercase">BOOSTMYSITES</span>
                </Link>

                {/* Desktop Menu */}
                <div className="hidden md:flex items-center space-x-8">
                    <Link to="/market-picks" className="text-heading hover:text-primary font-medium transition-colors text-sm">
                        Daily Analyses
                    </Link>
                    {hasBlogs && (
                        <Link to="/blogs" className="text-heading hover:text-primary font-medium transition-colors text-sm">
                            Blogs
                        </Link>
                    )}
                    {hasDashboard && (
                        <Link to="/dashboard" className="text-heading hover:text-primary font-medium transition-colors text-sm">
                            Dashboard
                        </Link>
                    )}
                    <Link to="/contact-us" className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded text-sm font-bold transition-colors shadow-sm">
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
                    <Link to="/market-picks" className="text-heading font-medium" onClick={() => setIsMobileMenuOpen(false)}>Daily Analyses</Link>
                    {hasBlogs && (
                        <Link to="/blogs" className="text-heading font-medium" onClick={() => setIsMobileMenuOpen(false)}>Blogs</Link>
                    )}
                    {hasDashboard && (
                        <Link to="/dashboard" className="text-heading font-medium" onClick={() => setIsMobileMenuOpen(false)}>Dashboard</Link>
                    )}
                    <Link to="/predict" className="bg-primary text-white py-3 rounded text-center font-bold" onClick={() => setIsMobileMenuOpen(false)}>Launch App</Link>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
