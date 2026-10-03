import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './page.js';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
