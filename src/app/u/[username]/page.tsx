import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UserFootprints } from "@/components/UserFootprints";
import { getProfile } from "@/lib/data";

export default function UserPage({ params }: PageProps<"/u/[username]">) {
  return (
    <Suspense fallback={<p className="text-muted">載入中…</p>}>
      <Footprints params={params} />
    </Suspense>
  );
}

async function Footprints({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();
  return <UserFootprints profile={profile} />;
}
