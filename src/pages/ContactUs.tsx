import React, { useState, useEffect } from 'react';
import Layout from '../components/landingpage/Layout';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ScrollReveal } from '../components/ui/ScrollReveal';

const formSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    email: z.string().email({ message: 'Please enter a valid email address.' }),
    phone: z.string().min(10, { message: 'Please enter a valid phone number.' }),
    telegram_id: z.string().optional(),
    description: z.string().optional(),
});

const ContactUsPage = () => {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            telegram_id: '',
            description: '',
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            const { error } = await supabase
                .from('contact_submissions')
                .insert([{
                    name: values.name,
                    email: values.email,
                    phone: values.phone,
                    telegram_id: values.telegram_id || null,
                    description: values.description || null,
                }]);

            if (error) throw error;

            toast.success('Form submitted successfully! We will get back to you soon.');
            form.reset();
        } catch (error: any) {
            console.error('Error submitting form:', error);
            toast.error('Failed to submit form. Please try again later.');
        }
    };

    // Hero Background Animation States
    const [squares, setSquares] = useState<{ top: number, left: number }[]>([]);
    const [drops, setDrops] = useState<{ id: number, key: number, left: number, duration: number, delay: number }[]>([]);

    useEffect(() => {
        const getUniqueLeft = () => {
            return Math.floor(Math.random() * 20) * 80;
        };

        const generateSquares = () => {
            const newSquares = [];
            const numSquares = 5;

            for (let i = 0; i < numSquares; i++) {
                const top = Math.floor(Math.random() * 10) * 80;
                const left = Math.floor(Math.random() * 20) * 80;
                newSquares.push({ top, left });
            }
            setSquares(newSquares);
        };

        const initDrops = () => {
            const newDrops = [];
            const numDrops = 3;

            for (let i = 0; i < numDrops; i++) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2;
                const delay = Math.random() * 3;
                newDrops.push({
                    id: i,
                    key: i,
                    left,
                    duration,
                    delay
                });
            }
            setDrops(newDrops);
        };

        generateSquares();
        initDrops();

        const interval = setInterval(generateSquares, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleDropAnimationEnd = (dropId: number) => {
        const getUniqueLeft = () => {
            return Math.floor(Math.random() * 20) * 80;
        };

        setDrops(prevDrops => prevDrops.map(drop => {
            if (drop.id === dropId) {
                const left = getUniqueLeft();
                const duration = 2 + Math.random() * 2;
                const delay = Math.random() * 2;
                return {
                    ...drop,
                    key: drop.key + 1,
                    left,
                    duration,
                    delay
                };
            }
            return drop;
        }));
    };

    return (
        <Layout>
            <section className="relative min-h-screen flex items-center justify-center pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-black">

                {/* Overlay Gradients for Depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black z-0 pointer-events-none"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-black/60 to-black z-0 pointer-events-none"></div>

                {/* Background Animation Canvas */}
                <div className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                        backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
              `,
                        backgroundSize: '80px 80px'
                    }}
                >
                    {/* Animated Elements */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse z-0 hidden md:block"></div>

                    {/* Dynamic colored squares */}
                    {squares.map((pos, index) => (
                        <div
                            key={`square-${index}`}
                            className="absolute w-[80px] h-[80px] bg-cyan-500/10 transition-all duration-1000 ease-in-out"
                            style={{
                                top: `${pos.top}px`,
                                left: `${pos.left}px`
                            }}
                        ></div>
                    ))}

                    {/* Drops */}
                    {drops.map((drop) => (
                        <div
                            key={`${drop.id}-${drop.key}`}
                            className="absolute w-[2px] h-[150px] bg-gradient-to-b from-transparent to-cyan-500 animate-drop"
                            style={{
                                left: `${drop.left}px`,
                                top: '-150px',
                                animationDuration: `${drop.duration}s`,
                                animationDelay: `${drop.delay}s`
                            }}
                            onAnimationEnd={() => handleDropAnimationEnd(drop.id)}
                        ></div>
                    ))}
                </div>

                <div className="container-custom relative z-20 max-w-2xl mx-auto">
                    <ScrollReveal delay={0.2}>
                        <div className="text-center mb-12">
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-6">
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">Contact Us</span>
                            </h1>
                            <p className="text-lg md:text-xl text-gray-400 font-light max-w-xl mx-auto">
                                Fill out the form below and our team will get back to you as soon as possible to launch your platform.
                            </p>
                        </div>
                    </ScrollReveal>

                    <ScrollReveal delay={0.4}>
                        <div className="bg-zinc-900/50 backdrop-blur-xl p-8 md:p-10 rounded-3xl border border-white/10 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white font-medium">Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Your Name" {...field} className="h-14 bg-white/5 text-white border-white/10 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 placeholder:text-gray-500 rounded-xl" />
                                                </FormControl>
                                                <FormMessage className="text-red-400" />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white font-medium">Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="your.email@example.com" {...field} className="h-14 bg-white/5 text-white border-white/10 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 placeholder:text-gray-500 rounded-xl" />
                                                </FormControl>
                                                <FormMessage className="text-red-400" />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="phone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white font-medium">Number</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Your Phone Number" {...field} className="h-14 bg-white/5 text-white border-white/10 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 placeholder:text-gray-500 rounded-xl" />
                                                </FormControl>
                                                <FormMessage className="text-red-400" />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="telegram_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white font-medium">Telegram ID (If Applicable)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="@username" {...field} className="h-14 bg-white/5 text-white border-white/10 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 placeholder:text-gray-500 rounded-xl" />
                                                </FormControl>
                                                <FormMessage className="text-red-400" />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white font-medium">Description (Optional)</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Tell us more about your requirements"
                                                        {...field}
                                                        className="min-h-[140px] bg-white/5 text-white border-white/10 focus-visible:ring-cyan-500 focus-visible:border-cyan-500 placeholder:text-gray-500 rounded-xl resize-none py-4"
                                                    />
                                                </FormControl>
                                                <FormMessage className="text-red-400" />
                                            </FormItem>
                                        )}
                                    />
                                    <Button
                                        type="submit"
                                        className="w-full h-14 text-lg font-bold bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all hover:-translate-y-1 rounded-xl mt-4"
                                        disabled={form.formState.isSubmitting}
                                    >
                                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit Form'}
                                    </Button>
                                </form>
                            </Form>
                        </div>
                    </ScrollReveal>
                </div>
            </section>
        </Layout>
    );
};

export default ContactUsPage;
