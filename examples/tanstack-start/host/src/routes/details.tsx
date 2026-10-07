import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/details')({
  component: DetailsPage,
});

function DetailsPage() {
  return (
    <main>
      <h1 id="details-title">TanStack Start details</h1>
      <p>This route was rendered and hydrated by TanStack Start.</p>
    </main>
  );
}
