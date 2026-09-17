import type { Metadata } from "next";
import { PublicPage } from "@/app/components/public-page";
export const metadata: Metadata = { title: "Privacy — Find Anything" };

/**
 * Describes only what the product actually does today. Every claim here is
 * traceable to code: the requested scope (lib/google-drive/oauth.ts), what
 * indexing stores (db/schema.ts), how credentials are stored
 * (lib/google-drive/crypto.ts), and what deletion removes
 * (deleteConnectorData in lib/google-drive/repository.ts).
 */
export default function Privacy() {
  return (
    <PublicPage
      badge="Privacy · Private beta"
      title="Collect less. Expose less."
      lede="Find Anything is an invite-only controlled beta. This notice describes current product behavior and still requires legal review before a broader release."
    >
      <section className="content-section">
        <h2>What Google Drive access we request, and why</h2>
        <ul className="status-list">
          <li>
            One scope is requested:{" "}
            <code>https://www.googleapis.com/auth/drive.file</code>. It is
            per-file: Find Anything can only reach the specific files you choose
            in Google&rsquo;s file picker. The rest of your Drive is invisible to
            it — not just unread, but unlistable.
          </li>
          <li>
            Plain honesty about the consent screen: Google describes this
            permission as the ability to see, edit, create, and delete{" "}
            <em>only the specific files you use with the app</em>. Find Anything
            only ever reads. It does not edit, create, move, or delete anything
            in your Drive, and no code path attempts to.
          </li>
          <li>
            Per-file access is used to extract the text and structure of the
            files you picked, so answers can prove which sources they came from
            and which of your shared sources were unavailable.
          </li>
          <li>
            Files you add to Drive later are not visible to Find Anything until
            you add them through the picker. Changes to already-shared files are
            picked up at the next indexing pass, and revoking a file&rsquo;s
            access removes it from the index at the next pass.
          </li>
          <li>
            Google has not verified or approved this application. Its brand
            verification is pending. During the beta the founder also adds each
            approved tester&rsquo;s Google account individually so consent can be
            granted while the OAuth client is still in testing.
          </li>
        </ul>
      </section>
      <section className="content-section">
        <h2>What indexing stores</h2>
        <ul className="status-list">
          <li>
            File metadata: provider file ID, name, MIME type, size, modification
            time, and the Drive link.
          </li>
          <li>
            Extracted text, stored as searchable units with their locations
            (document paragraphs, sheet cells, slide numbers) so citations can
            point at exact evidence. This means document text is stored in the
            product&rsquo;s database, not only referenced in Drive.
          </li>
          <li>
            Derived records: content hashes, inferred relationships between
            files, detected conflicts, and per-search retrieval traces and
            receipts. Traces and receipts include the query text you typed and
            the citations returned.
          </li>
          <li>
            Indexing job history: counts, stages, retry attempts, coverage
            receipts, and failure records. Failure records may include a sanitized
            file name so you can tell which file could not be read.
          </li>
          <li>
            No external AI provider receives your file content. Text extraction
            runs on deterministic parsers inside the hosting boundary, and no
            document content, file name, or query is sent to any third-party
            model API. An optional AI-enrichment stage exists in the code but is
            disabled in production; if it is ever enabled, this policy will be
            updated first and the change will be announced before it applies.
          </li>
          <li>
            All of it is scoped to one workspace. Workspace membership is checked
            server-side on every workspace, connector, search, trace, and receipt
            request, so one workspace can never read another&rsquo;s files.
          </li>
        </ul>
      </section>
      <section className="content-section">
        <h2>How OAuth credentials are stored</h2>
        <ul className="status-list">
          <li>
            Access and refresh tokens are encrypted server-side with AES-GCM
            before they are written to the database, using a key held only as a
            server secret.
          </li>
          <li>
            Refresh tokens never leave the server, are never placed in a URL,
            and are never written to ordinary logs. Neither are Google&rsquo;s
            raw error responses; only stable internal error codes are logged.
          </li>
          <li>
            One deliberate exception, because Google&rsquo;s picker requires it:
            when you open the file picker, your browser receives a short-lived
            access token (it expires within about an hour and grants only the
            same per-file access described above) so Google&rsquo;s own dialog
            can act as you. The long-lived refresh token is not part of this.
          </li>
          <li>
            The authorization handshake uses PKCE, and the OAuth state is stored
            only as a hash with a ten-minute expiry, bound to the actor and
            workspace that started it.
          </li>
        </ul>
      </section>
      <section className="content-section">
        <h2>Retention, disconnect, and deletion</h2>
        <ul className="status-list">
          <li>
            Indexed Drive data is retained for as long as the connection exists.
            There is no automatic expiry on indexed content today; you remove it
            by disconnecting.
          </li>
          <li>
            <b>Disconnect and delete</b> is available in{" "}
            <a href="/settings">Settings</a> to the workspace owner. The server
            first asks Google to revoke the token. If Google does not confirm
            revocation, nothing is deleted and you can safely retry.
          </li>
          <li>
            Once revocation is confirmed, these are permanently deleted:
            encrypted tokens and pending authorization state; indexed file
            metadata, versions, and extracted text units; search vectors,
            inferred relationships, and detected conflicts; retrieval traces and
            search receipts including their stored queries and citations; and
            indexing job history, retry attempts, failure records, and coverage
            receipts.
          </li>
          <li>
            These are kept, because they are not Drive content: your account, the
            workspace and its membership record, developer API keys you created,
            feedback you submitted, and privacy-safe aggregate event counters.
          </li>
          <li>
            Deleting the workspace or the account itself is a founder-run request
            during the beta; it is not yet a self-service action. Write to{" "}
            <a href="mailto:privacy@findanything.dev">privacy@findanything.dev</a>{" "}
            and it is performed manually.
          </li>
          <li>Default beta analytics retention is 90 days.</li>
        </ul>
      </section>
      <section className="content-section">
        <h2>Access requests</h2>
        <ul className="status-list">
          <li>
            We collect the form information you submit so the protected admin can
            evaluate design-partner fit.
          </li>
          <li>
            Work email is encrypted before storage; duplicate detection uses a
            one-way keyed hash, so a repeat request updates one record instead of
            creating another.
          </li>
          <li>
            A request never reveals whether an email already has an account, an
            invitation, or any provider-side configuration.
          </li>
          <li>
            Do not submit credentials, private document content, regulated data,
            or other sensitive material.
          </li>
        </ul>
      </section>
      <section className="content-section">
        <h2>Analytics</h2>
        <p>
          First-party analytics record coarse funnel and reliability events in the
          application database. They do not store document contents, Drive
          tokens, filenames, or raw search queries. Protected admins can view
          aggregate metrics.
        </p>
        <p className="disclosure">
          Retention schedules, subprocessors, data-subject procedures, and final
          legal terms require counsel before public production use. Contact{" "}
          <a href="mailto:privacy@findanything.dev">privacy@findanything.dev</a>.
        </p>
      </section>
    </PublicPage>
  );
}
