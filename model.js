export const STORAGE_KEY = "gatherTabsState";

export function initialState() {
  return {
    version: 1,
    collections: [
      { id: "inbox", name: "收件箱", color: "#dc665f", items: [] },
      { id: "reading", name: "稍后阅读", color: "#358479", items: [] },
      { id: "projects", name: "项目", color: "#6673ae", items: [] }
    ]
  };
}

export function normalizeState(value) {
  if (!value || !Array.isArray(value.collections)) return initialState();
  return {
    version: 1,
    collections: value.collections
      .filter((collection) => collection && typeof collection.id === "string")
      .map((collection) => ({
        id: collection.id,
        name: typeof collection.name === "string" ? collection.name : "未命名",
        color: typeof collection.color === "string" ? collection.color : "#6673ae",
        items: Array.isArray(collection.items) ? collection.items.filter((item) => item && item.url) : []
      }))
  };
}

export function validWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function savePage(state, collectionId, page) {
  const url = validWebUrl(page.url);
  const collection = state.collections.find((entry) => entry.id === collectionId);
  if (!url || !collection) return { state, result: "invalid" };
  if (collection.items.some((item) => item.url === url)) return { state, result: "duplicate" };
  const item = {
    id: crypto.randomUUID(),
    url,
    title: (page.title || new URL(url).hostname).trim(),
    createdAt: Date.now()
  };
  collection.items.unshift(item);
  return { state, result: "saved" };
}

export function movePage(state, itemId, targetCollectionId) {
  const target = state.collections.find((entry) => entry.id === targetCollectionId);
  if (!target) return false;
  for (const collection of state.collections) {
    const index = collection.items.findIndex((item) => item.id === itemId);
    if (index === -1) continue;
    if (collection.id === targetCollectionId) return false;
    const [item] = collection.items.splice(index, 1);
    if (!target.items.some((entry) => entry.url === item.url)) target.items.unshift(item);
    return true;
  }
  return false;
}
