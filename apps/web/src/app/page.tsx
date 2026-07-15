import { AnnouncementBar } from "../components/marketing/AnnouncementBar";
import { HeroMosaic } from "../components/marketing/HeroMosaic";
import { HeroPanel } from "../components/marketing/HeroPanel";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { ProcessSteps } from "../components/marketing/ProcessSteps";
import { ProductDemo } from "../components/marketing/ProductDemo";
import { SafetySection } from "../components/marketing/SafetySection";

export default function HomePage() {
  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="hero-stage">
        <HeroMosaic />
        <HeroPanel />
      </section>
      <ProcessSteps />
      <ProductDemo />
      <SafetySection />
      <MarketingFooter />
    </main>
  );
}
