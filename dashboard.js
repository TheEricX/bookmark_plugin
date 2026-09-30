import { STORAGE_KEY, initialState, normalizeState, savePage, movePage, validWebUrl } from "./model.js";

const api = globalThis.browser ?? globalThis.chrome;
const colors = ["#dc665f", "#358479", "#6673ae", "#d29442", "#a96887", "#566d83"];
const ui = Object.fromEntries([
  "search", "collection-nav", "collection-count", "item-count", "view-caption", "collections",
  "tabs-list", "tab-count", "open-tabs", "collection-dialog", "collection-form", "collection-name",
  "dialog-title", "color-picker", "delete-collection", "link-dialog", "link-form", "link-url",
  "link-title", "toast"
].map((id) => [id, document.getElementById(id)]));

let state = initialState();
let openTabs = [];
let selectedCollectionId = null;
let editingCollectionId = null;
let linkCollectionId = null;
let chosenColor = colors[0];
let dragged = null;
let dragPreview = null;
let toastTimer;
let tabsTimer;
let dockFrame = null;
let dockPointerY = null;
const dockMedia = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("visible"), 2600);
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "网页"; }
}

function favicon(url) {
  const icon = document.createElement("span");
  icon.className = "favicon";
  icon.textContent = hostname(url).charAt(0).toUpperCase();
  return icon;
}

function button(label, className, onClick, title = label) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.title = title;
  element.addEventListener("click", onClick);
  return element;
}

function setDragPreview(event, title, url) {
  if (!event.dataTransfer.setDragImage) return;
  clearDragPreview();
  const preview = document.createElement("div");
  preview.className = "drag-preview";
  preview.append(favicon(url));
  const label = document.createElement("span");
  label.textContent = title;
  preview.append(label);
  preview.style.left = `${Math.max(0, Math.min(event.clientX - 22, innerWidth - 260))}px`;
  preview.style.top = `${Math.max(0, Math.min(event.clientY - 27, innerHeight - 54))}px`;
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, 22, 27);
  dragPreview = preview;
  requestAnimationFrame(() => { if (dragPreview === preview) preview.style.opacity = "0"; });
}

function clearDragPreview() {
  dragPreview?.remove();
  dragPreview = null;
}

function clearDropTargets() {
  for (const target of document.querySelectorAll(".drop-active")) {
    target.classList.remove("drop-active");
  }
}

function attachDropTarget(target, collection) {
  target.addEventListener("dragover", (event) => {
    const types = Array.from(event.dataTransfer.types);
    if (!dragged && !types.includes("text/uri-list") && !types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dragged?.type === "saved" ? "move" : "copy";
    target.classList.add("drop-active");
  });
  target.addEventListener("dragleave", (event) => {
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    if (!target.contains(event.relatedTarget) && !target.contains(underPointer)) target.classList.remove("drop-active");
  });
  target.addEventListener("drop", async (event) => {
    event.preventDefault();
    clearDragPreview();
    clearDropTargets();
    if (dragged?.type === "saved") {
      const moved = movePage(state, dragged.itemId, collection.id);
      dragged = null;
      if (moved) { await persist(); showToast(`已移到「${collection.name}」`); }
      return;
    }
    const raw = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const url = validWebUrl(raw.split(/\r?\n/).find((line) => line && !line.startsWith("#"))?.trim());
    const tab = dragged?.type === "tab" ? openTabs.find((entry) => entry.id === dragged.tabId) : null;
    dragged = null;
    if (!url) { showToast("只支持 http 和 https 网页"); return; }
    await addPage(collection.id, { url, title: tab?.title || hostname(url) });
  });
}

async function persist() {
  await api.storage.local.set({ [STORAGE_KEY]: state });
  render();
}

function totalItems() {
  return state.collections.reduce((sum, collection) => sum + collection.items.length, 0);
}

function renderNav() {
  ui["collection-nav"].replaceChildren();
  const all = button("全部收藏", `nav-item ${selectedCollectionId === null ? "active" : ""}`, () => {
    selectedCollectionId = null;
    render();
  });
  all.prepend(Object.assign(document.createElement("span"), { className: "nav-glyph", textContent: "▦" }));
  ui["collection-nav"].append(all);
  for (const collection of state.collections) {
    const item = button(collection.name, `nav-item ${selectedCollectionId === collection.id ? "active" : ""}`, () => {
      selectedCollectionId = collection.id;
      render();
    });
    const dot = document.createElement("span");
    dot.className = "nav-dot";
    dot.style.backgroundColor = collection.color;
    item.prepend(dot);
    const count = document.createElement("span");
    count.className = "nav-count";
    count.textContent = collection.items.length;
    item.append(count);
    attachDropTarget(item, collection);
    ui["collection-nav"].append(item);
  }
}

function renderCard(item, collectionId) {
  const card = document.createElement("article");
  card.className = "link-card";
  card.draggable = true;
  card.addEventListener("dragstart", (event) => {
    dragged = { type: "saved", itemId: item.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/uri-list", item.url);
    setDragPreview(event, item.title, item.url);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => { dragged = null; card.classList.remove("dragging"); clearDragPreview(); clearDropTargets(); });
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "card-link";
  link.append(favicon(item.url));
  const text = document.createElement("span");
  text.className = "card-text";
  const title = document.createElement("strong");
  title.textContent = item.title;
  const domain = document.createElement("small");
  domain.textContent = hostname(item.url);
  text.append(title, domain);
  link.append(text);
  const remove = button("×", "card-remove", async (event) => {
    event.stopPropagation();
    const collection = state.collections.find((entry) => entry.id === collectionId);
    collection.items = collection.items.filter((entry) => entry.id !== item.id);
    await persist();
    showToast("已移除网页");
  }, "移除网页");
  remove.setAttribute("aria-label", `移除 ${item.title}`);
  card.append(link, remove);
  return card;
}

function renderCollection(collection, query) {
  const section = document.createElement("section");
  section.className = "collection-section";
  section.dataset.collectionId = collection.id;
  attachDropTarget(section, collection);

  const heading = document.createElement("div");
  heading.className = "collection-heading";
  const titleWrap = document.createElement("div");
  titleWrap.className = "collection-title-wrap";
  const dot = document.createElement("span");
  dot.className = "collection-dot";
  dot.style.backgroundColor = collection.color;
  const title = document.createElement("h2");
  title.textContent = collection.name;
  const count = document.createElement("span");
  count.className = "collection-total";
  count.textContent = collection.items.length;
  titleWrap.append(dot, title, count);
  const actions = document.createElement("div");
  actions.className = "collection-actions";
  actions.append(
    button("＋ 添加网页", "text-button", () => openLinkDialog(collection.id)),
    button("···", "icon-button", () => openCollectionDialog(collection.id), `编辑${collection.name}`)
  );
  heading.append(titleWrap, actions);
  section.append(heading);

  const matches = collection.items.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(query));
  const grid = document.createElement("div");
  grid.className = "cards-grid";
  for (const item of matches) grid.append(renderCard(item, collection.id));
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-collection";
    empty.textContent = query ? "没有匹配的网页" : "暂无网页";
    grid.append(empty);
  }
  section.append(grid);
  return section;
}

function render() {
  renderNav();
  const query = ui.search.value.trim().toLowerCase();
  const visible = selectedCollectionId
    ? state.collections.filter((entry) => entry.id === selectedCollectionId)
    : state.collections;
  ui.collections.replaceChildren(...visible.map((collection) => renderCollection(collection, query)));
  ui["collection-count"].textContent = `${state.collections.length} 个收藏夹`;
  ui["item-count"].textContent = `${totalItems()} 个网页`;
  ui["view-caption"].textContent = selectedCollectionId ? visible[0]?.name || "收藏夹" : "全部收藏";
}

function renderTabs() {
  resetTabMagnification();
  ui["tabs-list"].replaceChildren();
  ui["tab-count"].textContent = openTabs.length;
  if (!openTabs.length) {
    const empty = document.createElement("p");
    empty.className = "empty-tabs";
    empty.textContent = "这个窗口还没有可保存的网页";
    ui["tabs-list"].append(empty);
  }
  for (const tab of openTabs) {
    const row = document.createElement("div");
    row.className = "tab-row";
    row.draggable = true;
    row.title = tab.title || hostname(tab.url);
    row.addEventListener("dragstart", (event) => {
      dragged = { type: "tab", tabId: tab.id };
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/uri-list", tab.url);
      event.dataTransfer.setData("text/plain", tab.url);
      setDragPreview(event, tab.title || hostname(tab.url), tab.url);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => { dragged = null; row.classList.remove("dragging"); clearDragPreview(); resetTabMagnification(); clearDropTargets(); });
    row.append(favicon(tab.url));
    const copy = document.createElement("span");
    copy.className = "tab-copy";
    const title = document.createElement("strong");
    title.textContent = tab.title || hostname(tab.url);
    const domain = document.createElement("small");
    domain.textContent = hostname(tab.url);
    copy.append(title, domain);
    row.append(copy);
    const save = button("＋", "tab-save", () => addPage("inbox", tab), "保存到收件箱");
    save.setAttribute("aria-label", `保存 ${title.textContent} 到收件箱`);
    row.append(save);
    ui["tabs-list"].append(row);
  }
}

function resetTabMagnification() {
  if (dockFrame !== null) cancelAnimationFrame(dockFrame);
  dockFrame = null;
  dockPointerY = null;
  for (const row of ui["tabs-list"].querySelectorAll(".tab-row")) {
    row.style.removeProperty("--dock-icon");
    row.style.removeProperty("--dock-title");
    row.classList.remove("dock-near");
  }
}

function updateTabMagnification() {
  dockFrame = null;
  if (dockPointerY === null || !dockMedia.matches || dragged) return;
  for (const row of ui["tabs-list"].querySelectorAll(".tab-row")) {
    const rect = row.getBoundingClientRect();
    const distance = Math.abs(dockPointerY - (rect.top + rect.height / 2));
    const proximity = Math.max(0, 1 - distance / 150);
    const focus = proximity * proximity * (3 - 2 * proximity);
    row.style.setProperty("--dock-icon", `${(25 + 11 * focus).toFixed(1)}px`);
    row.style.setProperty("--dock-title", `${(12 + 2 * focus).toFixed(1)}px`);
    row.classList.toggle("dock-near", focus > 0.15);
  }
}

function scheduleTabMagnification() {
  if (dockFrame === null) dockFrame = requestAnimationFrame(updateTabMagnification);
}

ui["tabs-list"].addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !dockMedia.matches) return;
  dockPointerY = event.clientY;
  scheduleTabMagnification();
});
ui["tabs-list"].addEventListener("pointerleave", () => { if (!dragged) resetTabMagnification(); });
ui["tabs-list"].addEventListener("scroll", scheduleTabMagnification, { passive: true });
dockMedia.addEventListener("change", resetTabMagnification);

async function refreshTabs() {
  try {
    const tabs = await api.tabs.query({ currentWindow: true });
    openTabs = tabs.filter((tab) => validWebUrl(tab.url));
    renderTabs();
  } catch {
    showToast("无法读取标签页，请检查扩展权限");
  }
}

async function addPage(collectionId, page) {
  const outcome = savePage(state, collectionId, page);
  if (outcome.result === "saved") {
    await persist();
    const name = state.collections.find((entry) => entry.id === collectionId)?.name;
    showToast(`已保存到「${name}」`);
  } else {
    showToast(outcome.result === "duplicate" ? "这个收藏夹已有该网页" : "无法保存此网页");
  }
}

function renderColors() {
  ui["color-picker"].replaceChildren();
  for (const color of colors) {
    const swatch = button("", `color-swatch ${chosenColor === color ? "chosen" : ""}`, () => {
      chosenColor = color;
      renderColors();
    }, "选择颜色");
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-label", `颜色 ${color}`);
    swatch.setAttribute("aria-pressed", chosenColor === color);
    ui["color-picker"].append(swatch);
  }
}

function openCollectionDialog(id = null) {
  editingCollectionId = id;
  const collection = state.collections.find((entry) => entry.id === id);
  ui["dialog-title"].textContent = collection ? "编辑收藏夹" : "新建收藏夹";
  ui["collection-name"].value = collection?.name || "";
  chosenColor = collection?.color || colors[state.collections.length % colors.length];
  ui["delete-collection"].hidden = !collection || collection.id === "inbox";
  renderColors();
  ui["collection-dialog"].showModal();
  ui["collection-name"].focus();
}

function openLinkDialog(collectionId) {
  linkCollectionId = collectionId;
  ui["link-form"].reset();
  ui["link-dialog"].showModal();
  ui["link-url"].focus();
}

document.getElementById("add-collection").addEventListener("click", () => openCollectionDialog());
document.getElementById("add-collection-side").addEventListener("click", () => openCollectionDialog());
document.getElementById("cancel-dialog").addEventListener("click", () => ui["collection-dialog"].close());
document.getElementById("cancel-link-dialog").addEventListener("click", () => ui["link-dialog"].close());
document.getElementById("refresh-tabs").addEventListener("click", refreshTabs);
document.getElementById("toggle-tabs").addEventListener("click", () => ui["open-tabs"].classList.toggle("mobile-open"));
document.getElementById("close-tabs").addEventListener("click", () => ui["open-tabs"].classList.remove("mobile-open"));
ui.search.addEventListener("input", render);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    ui.search.focus();
  }
});

ui["collection-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = ui["collection-name"].value.trim();
  if (!name) return;
  if (editingCollectionId) {
    const collection = state.collections.find((entry) => entry.id === editingCollectionId);
    if (collection) { collection.name = name; collection.color = chosenColor; }
  } else {
    state.collections.push({ id: crypto.randomUUID(), name, color: chosenColor, items: [] });
  }
  ui["collection-dialog"].close();
  await persist();
});

ui["delete-collection"].addEventListener("click", async () => {
  const collection = state.collections.find((entry) => entry.id === editingCollectionId);
  if (!collection || collection.id === "inbox") return;
  const inbox = state.collections.find((entry) => entry.id === "inbox");
  for (const item of collection.items) {
    if (!inbox.items.some((entry) => entry.url === item.url)) inbox.items.push(item);
  }
  state.collections = state.collections.filter((entry) => entry.id !== collection.id);
  if (selectedCollectionId === collection.id) selectedCollectionId = null;
  ui["collection-dialog"].close();
  await persist();
  showToast("收藏夹已删除，网页已移到收件箱");
});

ui["link-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = validWebUrl(ui["link-url"].value);
  if (!url) { ui["link-url"].setCustomValidity("请输入 http 或 https 网址"); ui["link-url"].reportValidity(); return; }
  ui["link-dialog"].close();
  await addPage(linkCollectionId, { url, title: ui["link-title"].value.trim() || hostname(url) });
});
ui["link-url"].addEventListener("input", () => ui["link-url"].setCustomValidity(""));

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]?.newValue) {
    state = normalizeState(changes[STORAGE_KEY].newValue);
    render();
  }
});
for (const event of [api.tabs.onCreated, api.tabs.onRemoved, api.tabs.onUpdated, api.tabs.onActivated]) {
  event.addListener(() => { clearTimeout(tabsTimer); tabsTimer = setTimeout(refreshTabs, 150); });
}

async function init() {
  const stored = await api.storage.local.get(STORAGE_KEY);
  state = normalizeState(stored[STORAGE_KEY]);
  render();
  await refreshTabs();
}
init().catch(() => showToast("扩展初始化失败，请重新打开标签页"));
