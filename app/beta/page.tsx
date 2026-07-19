import Link from "next/link";
import {PublicPage} from "@/app/components/public-page";

export default function Beta() {
  return (
    <PublicPage
      badge="Controlled beta · Design partners"
      title="Help make private knowledge trustworthy for AI agents."
      lede="Find Anything is inviting a small group of teams that need permission-aware retrieval, exact citations, and a clear account of what their agents could not access."
    >
      <section className="content-section">
        <h2>What design partners evaluate</h2>
        <ul className="status-list">
          <li>Whether exact evidence and conflicts improve trust</li>
          <li>Whether coverage makes missing knowledge visible</li>
          <li>Whether traces, receipts, and replay help debug agents</li>
          <li>Whether the API and MCP interface fit real workflows</li>
        </ul>
        <p className="disclosure">
          Access is individually reviewed. Google Drive is the only available
          connector today; additional connectors shown on the marketing page
          are planned, not live.
        </p>
        <Link className="button-link" href="/#request-access">
          Request beta access
        </Link>
      </section>
    </PublicPage>
  );
}
