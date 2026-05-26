// src/App.tsx
import { PetManager } from './components/PetManager';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <PetManager />
    </ErrorBoundary>
  );
}
