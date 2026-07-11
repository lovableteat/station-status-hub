import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppRuntimeBoundary } from './components/common/AppRuntimeBoundary.tsx';

createRoot(document.getElementById("root")!).render(
  <AppRuntimeBoundary>
    <App />
  </AppRuntimeBoundary>
);
