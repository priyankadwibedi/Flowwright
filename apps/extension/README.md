# Flowwright Chrome extension

Build with `pnpm --filter @flowwright/extension build`, then open `chrome://extensions`, enable Developer mode, and choose **Load unpacked** for `apps/extension/build`. The build is self-contained: its manifest, popup, compiled service worker, and content script all live in that directory. The extension requires an explicit start action, records timestamps plus safe element descriptions, ignores password/card-like/sensitive fields, persists the local event log between page navigations, and exports a local JSON event log. It does not upload data.
