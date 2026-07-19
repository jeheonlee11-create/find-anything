# Public marketing preview

This revision prepares a public marketing surface while leaving every product
and admin route behind the existing ChatGPT Sites authentication and beta
authorization boundary. It is a local preview until an explicit deployment is
approved.

## Route boundary

- Public after a future Sites access-setting change: `/`, `/privacy`, `/terms`,
  `/trust`, `/beta`, the demo video, `POST /api/beta/waitlist`, and the strict
  allowlisted `POST /api/marketing/events` route.
- Authenticated and invite-only: `/app`, workspaces, Google OAuth, search,
  traces, receipts, diffs, feedback, and all workspace APIs.
- Admin-only: `/admin/beta`, access-request review, invitations, beta-account
  controls, operational metrics, and the Acme demo seed action.

Application authorization is enforced server-side and must remain in place
even if the Sites project is later made publicly visitable.

## Access requests

Migration `0016_new_colleen_wing.sql` adds `beta_access_requests`. Email is
encrypted with the existing token-encryption primitive and a keyed hash is
used for duplicate detection. The endpoint validates field types and lengths,
uses a honeypot plus minimum form-fill time, rate-limits by a peppered network
identifier and email, returns generic duplicate behavior, and never creates a
beta account automatically.

## Manual pre-deployment checklist

1. Review Privacy and Terms with counsel; the pages explicitly retain legal
   review caveats until that is complete.
2. Confirm `TOKEN_ENCRYPTION_KEY` and `BETA_INVITE_PEPPER` are present in the
   hosted environment without printing their values.
3. Apply migration `0016_new_colleen_wing.sql` to hosted D1 using the Sites
   migration flow. It is additive and does not reset existing data.
4. Keep Google OAuth in Testing, retain the current authorized custom-domain
   callback, and add only approved test-user accounts. Do not change scopes.
5. Verify the current scope remains
   `https://www.googleapis.com/auth/drive.readonly`.
6. Change Sites sharing only after confirming whether route-level public access
   is supported. If Sites sharing is all-or-nothing, do not make the project
   public until the authentication boundary has been revalidated on a canary.
7. Smoke-test anonymous marketing access, invite-only `/app`, disabled-user
   denial, admin denial, form abuse controls, and disconnect/revocation.
8. Keep rollback to the previous owner-only Site version available.

## Known limitations

- Google Drive is the only live connector. Every other connector is labeled
  planned.
- The marketing page describes deterministic permission-scoped retrieval; it
  does not claim semantic search or universal knowledge coverage.
- Source accounting covers sources known to the indexed workspace, not
  undiscovered systems or inaccessible connectors.
- Access requests are reviewed manually; they do not send email or provision
  an account automatically.
