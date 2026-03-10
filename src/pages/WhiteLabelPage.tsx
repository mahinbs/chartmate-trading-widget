import React from 'react';
import Layout from '../components/landingpage/Layout';
import WhiteLabelHero from '../components/whitelabel/Hero';
import PartnerSupport from '../components/whitelabel/PartnerSupport';
import InsideTheSoftware from '../components/whitelabel/InsideTheSoftware';
// import SupportedMarkets from '../components/landingpage/SupportedMarkets';
import HowItWorks from '../components/landingpage/HowItWorks';
import WhiteLabelWhyUs from '../components/whitelabel/WhyUs';
// import WhiteLabelWorkSlider from '../components/whitelabel/WorkSlider';
import WhiteLabelPricing from '../components/whitelabel/Pricing';
import WhiteLabelHowToGetStarted from '../components/whitelabel/HowToGetStarted';
import WhiteLabelFooter from '../components/whitelabel/Footer';

const WhiteLabelPage = () => {
    return (
        <Layout>
            <div className="bg-black text-white font-sans selection:bg-cyan-500 selection:text-black min-h-screen">
                <WhiteLabelHero />
                <PartnerSupport />
                <InsideTheSoftware />
                {/* <SupportedMarkets /> */}
                <HowItWorks />
                <WhiteLabelWhyUs />
                {/* <WhiteLabelWorkSlider /> */}
                <WhiteLabelPricing />
                <WhiteLabelHowToGetStarted />
            </div>
        </Layout>
    );
};

export default WhiteLabelPage;
