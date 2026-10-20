import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { PreferencesWindow } from './features/settings/PreferencesWindow.js';
import { AppUpdates } from './features/updates/AppUpdates.js';
import '@marklyra/editor-themes/paper.css';
import './style.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');
createRoot(root).render(
  <StrictMode>
    {new URL(location.href).searchParams.get('view') === 'preferences' ? (
      <PreferencesWindow />
    ) : (
      <App />
    )}
    <AppUpdates />
  </StrictMode>,
);
