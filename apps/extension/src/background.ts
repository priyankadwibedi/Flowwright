chrome.runtime.onMessage.addListener(
  (message: { type?: string }, _sender, sendResponse) => {
    if (message.type === "FLOWWRIGHT_EXPORT")
      chrome.storage.local
        .get("events")
        .then((data) => sendResponse({ events: data.events ?? [] }));
    return true;
  },
);
