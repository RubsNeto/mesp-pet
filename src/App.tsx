// src/App.tsx
import { TopDock } from './components/TopDock';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <TopDock />
    </ErrorBoundary>
  );
}
