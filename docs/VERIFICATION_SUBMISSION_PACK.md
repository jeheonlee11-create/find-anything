# Google restricted-scope verification — submission pack

Prepared 2026-09-16. Everything in this file is verified against the code as of
commit `c28b5d3` and is written to be pasted into the Verification Center
forms. Do not paste anything you have not confirmed is still true.

## Scope justification (paste for `drive.readonly`)

> Find Anything is a permission-aware search product. With the user's
> authorization it inventories the Google Drive files that user can already
> access, extracts text and structure with deterministic local parsers, and
> stores a searchable index so that answers carry exact citations (document
> paragraph, slide number, or sheet cell), per-search coverage accounting of
> which known sources were searched or unavailable, and durable retrieval
> records. Access is read-only by design: the application never creates,
> modifies, or deletes Drive content.
>
> The narrower `drive.file` scope is insufficient because the product's core
> function is complete discovery and continuous synchronization of the user's
> existing authorized corpus. `drive.file` only reaches files a user
> individually selects through the picker, which cannot provide corpus-wide
> inventory, coverage accounting ("what was missed"), or detection of
> conflicting versions across files the user did not hand-pick.
>
> Users can disconnect at any time from Settings; the server first confirms
> token revocation with Google and then permanently deletes the extracted
> index, traces, receipts, and all other Drive-derived records. No document
> content is sent to any external AI provider.

## Data storage and deletion explanation (paste when asked)

> Drive-derived data (file metadata, extracted text units with structural
> locations, content hashes, inferred relationships, detected conflicts,
> retrieval traces and receipts, and indexing job history) is stored in the
> application's Cloudflare D1 database, scoped per workspace with server-side
> membership checks on every request. OAuth tokens are encrypted with AES-GCM
> before storage; the key exists only as a server secret. Retention: indexed
> data is kept while the connection exists and has no automatic expiry;
> disconnecting deletes it. Disconnect-and-delete first requires confirmed
> Google token revocation, then permanently deletes every Drive-derived table
> row; the completeness of this deletion is covered by automated tests.

## Reviewer test instructions (adapt emails before pasting)

1. The application is invite-only during verification. The reviewer's Google
   account must be sent to us so we can (a) approve it at /admin/beta and
   (b) add it under Test users on the OAuth client. Provide a contact email
   in the form so we can turn this around quickly.
2. Visit https://findanything.dev — the public homepage, privacy, terms,
   trust, and support pages render without sign-in.
3. Click "Connect Google Drive". Sign in. An unapproved account lands on the
   invite-only page and never reaches a Google consent screen. An approved
   account continues to workspace creation and then Google's consent screen
   showing only the drive.readonly scope.
4. After consent, indexing runs automatically; the dashboard shows progress
   with honest counts. Search returns results with exact citations linking
   back to the source file in Drive.
5. In Settings, "Disconnect and delete" first revokes the token with Google,
   then deletes all indexed data. Re-searching afterwards returns nothing.

## Demo video shot list (one continuous recording, synthetic files only)

Record at findanything.dev in a normal browser window, address bar visible
throughout. Use the synthetic demo Drive folder — never a real workspace.

1. Address bar showing https://findanything.dev, scroll the homepage.
2. Open /privacy; scroll slowly past "What indexing stores" and the
   "No external AI provider" bullet.
3. Back to home; click Connect Google Drive.
4. Sign in (approved test account).
5. Workspace step, then Google's consent screen — pause on it.
6. Point out the single requested permission (read-only Drive) on the consent
   screen before approving.
7. Approve; land in the workspace.
8. Show indexing progressing (discovered/processed counts moving).
9. Run a search; show results.
10. Open a citation — the exact page/slide/cell — and click through to the
    source file in Drive.
11. Open the coverage view or a receipt showing sources accounted for.
12. Go to Settings; click Disconnect and delete; confirm.
13. Show the confirmation and that the workspace no longer lists files;
    re-run the search to show it returns nothing.
14. End on the homepage.

Upload unlisted to YouTube; paste the link in the verification form.

## Console session checklist (founder, in order)

1. Search Console: a google-site-verification TXT record already exists on
   findanything.dev — open Search Console, confirm the domain property shows
   verified (add it and click Verify if not; the record is already in DNS).
2. APIs & Services → Library: confirm Drive, Docs, Sheets, Slides APIs are
   enabled; enable nothing else.
3. OAuth consent screen → Branding: app name "Find Anything", support email
   you monitor, homepage https://findanything.dev, privacy
   https://findanything.dev/privacy, terms https://findanything.dev/terms,
   authorized domain findanything.dev, your own logo, developer contact you
   read daily. (Email to privacy@/hello@findanything.dev already routes via
   Cloudflare — confirm the specific addresses have routing rules.)
4. Audience: External + Testing (leave Testing until approval).
5. Data access / Scopes: exactly one sensitive/restricted scope —
   https://www.googleapis.com/auth/drive.readonly. Remove anything else.
6. Credentials: confirm https://findanything.dev origin and
   https://findanything.dev/api/connectors/google-drive/callback redirect are
   present (they are, per prior session); keep old entries for now.
7. Record the demo video (shot list above).
8. Verification Center → Submit, pasting the sections above.
9. Then: answer every Google email fast; when they name the CASA tier, pick
   an assessor from their list (budget tier ~$500–1,000/yr historically) —
   nothing is charged before you sign with a lab.

After approval only: switch publishing to In production, test with a
never-added account, then remove the invite gate and open signup (code
change, prepared separately).
