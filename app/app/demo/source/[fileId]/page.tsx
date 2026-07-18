import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireBetaChatGPTUser } from "@/app/chatgpt-auth";
import { PublicPage } from "@/app/components/public-page";
import { getDb } from "@/db";
import { extractedUnits, sourceFiles } from "@/db/schema";
import { pseudonymousActorId } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import { formatStructuralLocation } from "@/lib/workspace-search/citations";

const DEMO_WORKSPACE_ID = "ws_yc_demo_acme";

export default async function DemoSourcePage({ params }: { params: Promise<{ fileId: string }> }) {
  const { user } = await requireBetaChatGPTUser("/app");
  const actorId = await pseudonymousActorId(user.email.toLowerCase());
  if (!await actorWorkspace(actorId, DEMO_WORKSPACE_ID)) notFound();
  const { fileId } = await params;
  const db = await getDb();
  const rows = await db.select({ name: sourceFiles.name, mimeType: sourceFiles.mimeType, modifiedAt: sourceFiles.modifiedAt, unitType: extractedUnits.unitType, location: extractedUnits.structuralLocationJson, text: extractedUnits.textContent, hash: extractedUnits.contentHash }).from(sourceFiles).innerJoin(extractedUnits, eq(extractedUnits.fileId, sourceFiles.id)).where(and(eq(sourceFiles.workspaceId, DEMO_WORKSPACE_ID), eq(sourceFiles.id, fileId)));
  if (!rows[0]) notFound();
  const source = rows[0];
  return <PublicPage badge="Synthetic source · Investor demo" title={source.name} lede="A deterministic company-knowledge fixture. No private Drive data or live third-party content is used.">
    <section className="content-section source-document">
      <div className="source-meta"><span>{source.mimeType}</span><span>Modified {new Date(source.modifiedAt).toLocaleDateString()}</span><span>Permission scope: demo workspace only</span></div>
      <article><strong>{formatStructuralLocation(source.unitType, JSON.parse(source.location))}</strong><p>{source.text}</p><small>Evidence hash {source.hash}</small></article>
      <div className="audit-actions"><a href={`/app/workspaces/${DEMO_WORKSPACE_ID}`}>← Return to retrieval results</a></div>
    </section>
  </PublicPage>;
}
