# Privacy and security FAQ

**What access is requested?** Read-only access needed to inventory and extract supported Google Drive files.

**Can Find Anything edit my files?** No. The beta does not request Drive write or delete scopes.

**What is stored?** Encrypted connector credentials, authorized file metadata, extracted searchable units, evidence hashes, traces, receipts, privacy-safe events, and feedback IDs/comments.

**What is not shown to admins?** There is no broad internal document-content viewer.

**How do I remove access?** Use Disconnect Google Drive. The app revokes Google authorization before deleting connector credentials and indexed data.

**Are searches semantic?** No. This beta uses deterministic literal metadata and full-text search; embeddings are paused.
