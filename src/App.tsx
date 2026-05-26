// src/App.tsx
//
// Componente raiz: simplesmente delega para o PetManager.
// A janela inteira é transparente; só os elementos do MESP são visíveis.

import { PetManager } from './components/PetManager';

export function App() {
  return <PetManager />;
}
