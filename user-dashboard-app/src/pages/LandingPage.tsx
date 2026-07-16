import { Header } from "../components/landing/Header";
import { HeroSection } from "../components/landing/HeroSection";
import { FeatureCards } from "../components/landing/FeatureCards";
import { Footer } from "../components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-green-100 selection:text-green-900">
      <Header />
      <main>
        <HeroSection />
        <FeatureCards />
      </main>
      <Footer />
    </div>
  );
}
