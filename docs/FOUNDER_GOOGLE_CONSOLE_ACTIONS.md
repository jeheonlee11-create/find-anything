# Google Cloud Console actions the founder must perform

Everything on this page happens in the Google Cloud Console and in Google's
verification workflow. **No automated agent and no code in this repository can
perform any of it**, and none of it was performed while this document was
written. Each item requires a human signed in to the Google account that owns the
Cloud project.

Substitute the live public origin for `<ORIGIN>` below. With
`NEXT_PUBLIC_SITE_URL=https://findanything.dev`, `<ORIGIN>` is
`https://findanything.dev` — the site and the product share one origin, so there
is no separate app hostname to register.

## 1. Enable the APIs the connector uses

In **APIs & Services → Library**, in the same project as the OAuth client, enable:

- Google Drive API
- Google Docs API
- Google Sheets API
- Google Slides API

The Docs, Sheets, and Slides APIs are what make structural extraction work. Without
them the product falls back to plain-text export and says so in the file list.

## 2. Configure the OAuth consent screen

In **APIs & Services → OAuth consent screen**:

- User type: External. Publishing status: **Testing** (keep it there until
  verification is granted).
- App name: Find Anything. Support email and developer contact email: real,
  monitored addresses.
- App domain / homepage: `<ORIGIN>`
- Privacy policy URL: `<ORIGIN>/privacy`
- Terms of service URL: `<ORIGIN>/terms`
- Authorized domain: the registrable domain of `<ORIGIN>` (`findanything.dev`).
- Scopes: exactly one — `https://www.googleapis.com/auth/drive.readonly`. Do not
  add scopes. The application requests only this one, and adding more would make
  the consent screen inaccurate.

## 3. Add each approved tester as a test user

While publishing status is **Testing**, only listed test users can complete
consent. For every person approved into the beta:

1. Approve them inside Find Anything first (`/admin/beta`), which writes the
   invitation record the internal gate reads.
2. Then, in **OAuth consent screen → Test users → Add users**, add the exact
   Google account email that person will authorize Drive with.

Both steps are required and they are independent. Approving someone in Find
Anything does not add them to Google; adding them to Google does not grant them
Find Anything access. Google's cap on test users (100) is a hard limit on beta
size while in testing mode.

Never tell a user whether their address is or is not in this test-user list. The
product deliberately exposes no wording that implies Google-side state.

## 4. Configure the OAuth client credentials

In **APIs & Services → Credentials**, on the Web application OAuth 2.0 client:

- Authorized JavaScript origins: `<ORIGIN>`
- Authorized redirect URIs: `<ORIGIN>/api/connectors/google-drive/callback`
- Keep `http://localhost:3000/api/connectors/google-drive/callback` registered
  while local development continues.
- Copy the client ID and secret into the hosted server secrets as
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never commit them.

The redirect URI must match the deployed value byte for byte. When
`GOOGLE_REDIRECT_URI` is not set, the application derives it from
`NEXT_PUBLIC_SITE_URL`, so a mismatch between those two values is the most likely
cause of `redirect_uri_mismatch`.

## 5. Restricted-scope verification (later, deliberately not started)

`drive.readonly` is a **restricted** scope. Publishing the app requires Google
verification plus a security assessment. When the beta is ready to open:

1. Record a demonstration video showing sign-in, the consent screen, and exactly
   how the Drive data is used in-product.
2. Ensure the homepage at the verified domain explains the Drive scope use, and
   that the privacy policy is reachable at `<ORIGIN>/privacy`.
3. Submit for verification from the OAuth consent screen and answer Google's
   scope-justification questions.
4. Complete the CASA assessment tier Google assigns for restricted scopes,
   including remediation and annual reassessment.
5. Only after Google grants verification: switch publishing status to
   **In production**, then remove the internal invite gate (one change in
   `lib/beta/access-gate.ts`).

Until step 5 completes, no product surface may say or imply that Google has
verified or approved the application.

## What must never be done in a hurry

- Do not add scopes beyond `drive.readonly` to make a demo easier.
- Do not switch publishing status to production to avoid the test-user limit;
  that submits the app for review with whatever state it is in.
- Do not create a second Cloud project for the custom domain. Add the origin and
  redirect to the existing client so already-issued refresh tokens stay valid.
