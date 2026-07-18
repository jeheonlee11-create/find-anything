import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { RetrievalDiffViewer } from "@/app/components/retrieval-diff-viewer";
export const dynamic = "force-dynamic";
export default async function DiffPage({ searchParams }: { searchParams: Promise<{ before?: string; after?: string }> }) { await requireChatGPTUser("/diffs"); const params = await searchParams; return <main className="content-page"><RetrievalDiffViewer initialBefore={params.before ?? ""} initialAfter={params.after ?? ""} /></main>; }
