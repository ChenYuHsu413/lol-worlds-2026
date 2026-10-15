import { WorldsApp } from "@/components/WorldsApp";
import { fixturesEnabled, loadWorlds } from "@/lib/worlds";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  const { fixture } = await searchParams;
  const active = fixture && fixturesEnabled() ? fixture : null;
  const payload = await loadWorlds(active);
  return <WorldsApp initial={payload} fixture={active} />;
}
