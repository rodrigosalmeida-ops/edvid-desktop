import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBrowserLocalApi, isBrowserLocalRuntime } from './browser-local-api';
import { createQaBrowserApi } from './qa-browser-api';
import './brand/preview-base.css';
import './styles.css';

if (!window.edvidDesktop && isBrowserLocalRuntime()) {
  window.edvidDesktop = createBrowserLocalApi();
} else if (!window.edvidDesktop && import.meta.env.DEV) {
  window.edvidDesktop = createQaBrowserApi();
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento raiz do EDIT AI nao foi encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
