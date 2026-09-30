const previewListeners = [];
const noopEvent = { addListener() {} };
const previewTabs = [
  { id: 1, title: "Figma: Design and prototyping", url: "https://www.figma.com/" },
  { id: 2, title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
  { id: 3, title: "GitHub", url: "https://github.com/" },
  { id: 4, title: "Apple Developer Documentation", url: "https://developer.apple.com/documentation/" },
  { id: 5, title: "Chrome Extensions", url: "https://developer.chrome.com/docs/extensions/" }
];
globalThis.browser = {
  storage: {
    local: {
      async get(key) { return { [key]: JSON.parse(localStorage.getItem(key) || "null") }; },
      async set(values) {
        for (const [key, value] of Object.entries(values)) {
          localStorage.setItem(key, JSON.stringify(value));
          for (const listener of previewListeners) listener({ [key]: { newValue: value } }, "local");
        }
      }
    },
    onChanged: { addListener(listener) { previewListeners.push(listener); } }
  },
  tabs: {
    async query() { return previewTabs; },
    onCreated: noopEvent,
    onRemoved: noopEvent,
    onUpdated: noopEvent,
    onActivated: noopEvent
  }
};
