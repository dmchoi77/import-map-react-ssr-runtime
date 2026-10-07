import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { HostApp } from './App';

const root = document.getElementById('app-root');

if (!root) {
  throw new Error('React Router example root was not found.');
}

hydrateRoot(
  root,
  <BrowserRouter>
    <HostApp />
  </BrowserRouter>,
);
