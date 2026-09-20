import { NOW, obaviaDataset } from "@/fixtures/obavia";
import { buildOwnerView } from "@/lib/owner-model";
import { Home } from "@/components/home/Home";

/** Signed out: sign in. Setter and closer: their workspace is Today. Owner: Business. */
export default function HomePage() {
  const ownerView = buildOwnerView(obaviaDataset, NOW);
  return <Home ownerView={ownerView} />;
}
