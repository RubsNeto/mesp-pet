import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // O repositório tem dois lockfiles (raiz do app Electron + esta landing).
  // Fixar a raiz do Turbopack nesta pasta evita o aviso de "inferred workspace
  // root" e garante builds determinísticos no deploy (Vercel).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
