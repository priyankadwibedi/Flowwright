const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const state = document.querySelector<HTMLParagraphElement>("#state")!;
let recording = false;
toggle.addEventListener("click", async () => {
  recording = !recording;
  toggle.textContent = recording ? "Stop capture" : "Start capture";
  state.textContent = recording
    ? "Recording safe browser events…"
    : "Capture is off.";
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id)
    chrome.tabs.sendMessage(tabs[0].id, {
      type: recording ? "FLOWWRIGHT_START" : "FLOWWRIGHT_STOP",
    });
});
document
  .querySelector<HTMLButtonElement>("#export")!
  .addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "FLOWWRIGHT_EXPORT" }, (response) => {
      const blob = new Blob([JSON.stringify(response?.events ?? [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: "flowwright-events.json",
        saveAs: true,
      });
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });
