# Security policy

Report vulnerabilities privately to the repository maintainers; do not include real API keys, recordings, invoices, or personal data in an issue or pull request.

Keep OpenAI keys in backend environment variables. Never expose them through `NEXT_PUBLIC_*` variables or frontend bundles. Treat recordings, browser event logs, and generated code as sensitive. The prototype does not persist recordings and does not execute arbitrary generated shell commands.

High-impact workflow steps require a human approval gate. This project is a hackathon prototype with no authentication, tenant isolation, security guarantee, or production hardening. Validate the deployment, storage, and browser-extension permissions before any real-world use.
