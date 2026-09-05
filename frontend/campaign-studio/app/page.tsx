import StudioClient from "./studio-client";
import ReviewPortal from "./review-portal";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ review?: string }> }) {
  const query = await searchParams;
  if (query.review) return <ReviewPortal token={query.review} />;
  return <StudioClient displayName="Invitado" />;
}
