import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { StepProvider } from './context/StepContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StepProvider>
      <App />
    </StepProvider>
  </StrictMode>,
);
