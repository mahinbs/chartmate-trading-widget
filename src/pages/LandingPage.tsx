import Layout from '../components/landingpage/Layout'
import Hero from '../components/landingpage/Hero'
import Services from '../components/landingpage/Services'
import WhyUs from '../components/landingpage/WhyUs'
import Testimonial from '../components/landingpage/Testimonial'
import WorkSlider from '../components/landingpage/WorkSlider'
import HowToGetStarted from '../components/landingpage/HowToGetStarted'
import LatestInsights from '../components/landingpage/LatestInsights'
import FAQ from '../components/landingpage/FAQ'

const LandingPage = () => {
    return (
        <Layout>
            <Hero />
            <Services />
            <WhyUs />
            <Testimonial />
            <WorkSlider />
            <HowToGetStarted />
            <LatestInsights />
            <FAQ />
        </Layout>
    )
}

export default LandingPage