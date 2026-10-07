import { hydrateRoot } from 'react-dom/client';

import { HostApp } from './App';

const root = document.getElementById('app-root');

if (!root) {
  throw new Error('React Vite example root was not found.');
}

hydrateRoot(root, <HostApp />);
