import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './state';
import { App } from './App';
import { Intro } from './components/Intro/Intro';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <>
      <AppProvider>
        <App />
      </AppProvider>
      {/* Intro sits outside the app tree so it overlays everything via position:fixed */}
      <Intro />
    </>
  </StrictMode>,
);
