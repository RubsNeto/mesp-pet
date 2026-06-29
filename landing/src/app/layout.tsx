import type { Metadata, Viewport } from 'next';
import { Geist, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({
  variable: '--font-display-var',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const inter = Inter({
  variable: '--font-sans-var',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono-var',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://mesp-pet.vercel.app'),
  title: 'MESP Pet — Companion pixel-art para Kiro CLI',
  description:
    'O MESP fica no canto da sua tela acompanhando suas sessões de IA. Reage à Kiro CLI, Claude Code, Aider e mais. Open source, MIT.',
  openGraph: {
    title: 'MESP Pet — Companion pixel-art para Kiro CLI',
    description: 'Pixel art companion que reage aos seus comandos da Kiro CLI.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#08090f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
