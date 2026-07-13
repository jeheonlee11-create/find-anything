# Security policy

## Current status

Security program in development. This deployment contains synthetic demo data only and claims no certification or regulatory compliance.

## Production invariants

- Enforce actor, workspace, and source permissions on every read and mutation.
- Fail closed on unknown, revoked, or stale permission state.
- Keep OAuth refresh tokens server-side, envelope-encrypted, and out of logs.
- Treat filenames and extracted content as untrusted input.
- Never execute or follow instructions embedded in retrieved files.
- Verify OAuth state/PKCE, webhook signatures, CSRF protections, request limits, and deletion jobs.

Report vulnerabilities privately to the support contact once configured; do not include secrets or customer content.

## Known dependency finding

The July 2026 production-dependency audit reports two moderate PostCSS advisories through Next.js. The package manager proposes a breaking framework downgrade, so no unsafe forced fix was applied. Re-audit and update Next.js/PostCSS through a compatible upstream release before public beta.
