import './lib/workspaceHistory'; // Register history interception before any Router/editor.
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './platform-interaction.css';
import { AppRuntimeBoundary } from './components/common/AppRuntimeBoundary.tsx';

createRoot(document.getElementById("root")!).render(
  <AppRuntimeBoundary>
    <App />
  </AppRuntimeBoundary>
);
