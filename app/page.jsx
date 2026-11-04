import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Trusted from '@/components/Trusted';
import Bento from '@/components/Bento';
import Services from '@/components/Services';
import Tokenomics from '@/components/Tokenomics';
import Stats from '@/components/Stats';
import Process from '@/components/Process';
import Tools from '@/components/Tools';
import Integrations from '@/components/Integrations';
import Testimonials from '@/components/Testimonials';
import Faq from '@/components/Faq';
import Cta from '@/components/Cta';
import Footer from '@/components/Footer';
import SiteEffects from '@/components/SiteEffects';

export default function Page() {
  return (
    <>
      <Nav />

      <main suppressHydrationWarning>
        <Hero />
        <Trusted />
        <Bento />
        <Services />
        <Tokenomics />
        <Stats />
        <Process />
        <Tools />
        <Integrations />
        <Testimonials />
        <Faq />
        <Cta />
      </main>

      <Footer />

      <SiteEffects />
    </>
  );
}
