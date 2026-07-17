# Security policy

Report vulnerabilities privately to the repository maintainers. Do not include real API keys, recordings, invoices, or personal data in an issue or pull request.

## Working controls

- OpenAI keys stay in backend environment variables. Never expose them through `NEXT_PUBLIC_*` variables or frontend bundles.
- Request body, upload, event, evidence, transcript, duration, resolution, rate, and quota limits are enforced by the API.
- Sensitive browser fields (passwords, payment, OTP, tokens, SSN, hidden/file inputs, `data-flowwright-sensitive`) are omitted by the extension.
- Only trusted invoice compiler templates are generated and executed. Arbitrary model-generated code is never run as shell.
- High-impact invoice steps require an explicit human approval gate.
- Monetary comparisons use `Decimal`, not floating point.

## Prototype limitations

- Recordings remain local until the user consents and chooses **Process evidence**. Processing uploads media temporarily to the configured Flowwright backend. Selected frames and transcript text may be sent to the configured AI provider.
- Media is not retained by default (`retain_media=false`), but temporary processing files exist for the duration of a request. This is not a zero-retention guarantee.
- Approvals are recorded as synthetic in-memory identifiers for the demo; there is no durable approval database.
- There is no authentication, tenant isolation, or production hardening beyond hackathon request guards.
- The Chrome extension requests host access per tab through `optional_host_permissions` rather than permanent `<all_urls>` injection.

## Reporting

Validate deployment, storage, and browser-extension permissions before any real-world use.
