import { Link, Route, Routes } from 'react-router-dom';

import { RemoteApp } from '@example/react-router/remote';

function HomePage() {
  return (
    <section>
      <h1>React Router home</h1>
      <RemoteApp initial={0} />
    </section>
  );
}

function DetailsPage() {
  return (
    <section>
      <h1 id="details-title">React Router details</h1>
      <p>This route was rendered and hydrated by React Router.</p>
    </section>
  );
}

function NotFoundPage() {
  return <h1>Page not found</h1>;
}

export function HostApp() {
  return (
    <>
      <output id="host-status">React Router SSR ready</output>
      <nav aria-label="Primary navigation">
        <Link to="/">Home</Link>
        {' | '}
        <Link id="details-link" to="/details">
          Details
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/details" element={<DetailsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
