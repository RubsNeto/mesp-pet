import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { SpriteShowcase } from '@/components/SpriteShowcase';
import { Features } from '@/components/Features';
import { Terminal } from '@/components/Terminal';
import { Download } from '@/components/Download';
import { Footer } from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <SpriteShowcase />
        <Features />
        <Terminal />
        <Download />
      </main>
      <Footer />
    </>
  );
}
