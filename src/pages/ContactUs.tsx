import React from 'react';
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

    return (
        <Layout>
            <section className="relative bg-white pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        backgroundImage: `
        linear-gradient(to right, #f0f0f0 1px, transparent 1px),
        linear-gradient(to bottom, #f0f0f0 1px, transparent 1px)
      `,
                        backgroundSize: '80px 80px'
                    }}
                ></div>

                <div className="container-custom relative z-10 max-w-2xl mx-auto">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl md:text-5xl font-bold font-heading text-heading mb-4">Contact Us</h1>
                        <p className="text-lg text-gray-600">
                            Fill out the form below and our team will get back to you as soon as possible.
                        </p>
                    </div>

                    <div className="bg-gray-50 p-8 rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-heading font-bold">Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your Name" {...field} className="h-12 bg-white text-black border-gray-200" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-heading font-bold">Email</FormLabel>
                                            <FormControl>
                                                <Input placeholder="your.email@example.com" {...field} className="h-12 bg-white text-black border-gray-200" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-heading font-bold">Number</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your Phone Number" {...field} className="h-12 bg-white text-black border-gray-200" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="telegram_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-heading font-bold">Telegram ID (If Applicable)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="@username" {...field} className="h-12 bg-white text-black border-gray-200" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-heading font-bold">Description (Optional)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Tell us more about your requirements"
                                                    {...field}
                                                    className="min-h-[120px] bg-white text-black border-gray-200"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="submit"
                                    className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary-hover transition-all"
                                    disabled={form.formState.isSubmitting}
                                >
                                    {form.formState.isSubmitting ? 'Submitting...' : 'Submit Form'}
                                </Button>
                            </form>
                        </Form>
                    </div>
                </div>
            </section>
        </Layout>
    );
};

export default ContactUsPage;
