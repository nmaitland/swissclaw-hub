import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

export const registerServiceWorker = (
  win = window,
  nav = navigator
) => {
  if (!('serviceWorker' in nav) || (win.location.hostname !== 'localhost' && win.location.protocol !== 'https:')) {
    return false;
  }

  win.addEventListener('load', () => {
    nav.serviceWorker.register('/service-worker.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });

  return true;
};

registerServiceWorker();

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
