import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FootprintsView } from "@/components/FootprintsView";
import { getFootprints } from "@/lib/data";

export default function UserPage({ params }: PageProps<"/u/[username]">) {
  return (
    <Suspense fallback={<p className="text-muted">載入中…</p>}>
      <Footprints params={params} />
    </Suspense>
  );
}

async function Footprints({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const data = await getFootprints(username);
  if (!data) notFound();
  return <FootprintsView profile={data.profile} trips={data.trips} photos={data.photos} />;
}
