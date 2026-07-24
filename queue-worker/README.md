# Find Anything indexing queue worker

This package is an isolated Cloudflare Worker design for durable Google Drive
indexing continuations. It does not bind the Sites-managed D1 database. It
exchanges only signed, opaque continuation messages with private Sites
endpoints.

The checked-in Wrangler file is an example only. Creating the queues, adding
secrets, enabling billing, and deploying require separate approval.

`INDEXING_QUEUE_ENABLED` is fail-closed unless its value is the exact string
`true`. Enable it only after the matching Site endpoints, migration, and
directional secrets have been staged and verified.

Required Worker secrets:

- `INDEXING_QUEUE_INGRESS_SECRET` verifies Site-to-producer requests.
- `INDEXING_QUEUE_SERVICE_SECRET` signs consumer-to-Site requests.

Required Sites secrets:

- `INDEXING_QUEUE_INGRESS_SECRET`
- `INDEXING_QUEUE_SERVICE_SECRET`

Required Sites configuration:

- `INDEXING_QUEUE_DISPATCH_URL`
- `INDEXING_QUEUE_ENABLED=false` by default

Queue messages contain job, continuation, sequence, attempt epoch, protocol
version, and request time only. They must never contain OAuth credentials,
document contents, filenames, user identities, or encryption keys.
