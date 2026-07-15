# Flowwright Chrome extension

Build with `pnpm --filter @flowwright/extension build`, then open `chrome://extensions`, enable Developer mode, and choose **Load unpacked** for `apps/extension/public` (the manifest references the compiled files in the sibling `dist` directory). The extension requires an explicit start action, records timestamps plus safe element descriptions, ignores password/card-like/sensitive fields, and exports a local JSON event log. It does not upload data.
