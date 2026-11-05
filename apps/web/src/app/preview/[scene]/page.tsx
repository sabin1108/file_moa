import { notFound } from "next/navigation";
import { ScenePreview } from "../../../prototypes/demo/ScenePreview";
import { sceneIds, type SceneId } from "../../../prototypes/demo/scene-data";

export function generateStaticParams() { return sceneIds.map(scene => ({ scene })); }
export default async function Page({ params }: { params: Promise<{ scene: string }> }) {
  const { scene } = await params;
  if (!sceneIds.includes(scene as SceneId)) notFound();
  return <ScenePreview initial={scene as SceneId} />;
}
