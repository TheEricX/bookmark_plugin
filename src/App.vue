<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import { Bookmark, LayoutGrid, MoreHorizontal, PanelRightOpen, Plus, RefreshCw, Search, X } from "@lucide/vue";
import { STORAGE_KEY, initialState, movePage, normalizeState, savePage, validWebUrl } from "../model.js";

const api = globalThis.browser ?? globalThis.chrome;
const colors = ["#76578a", "#98697e", "#a37ac4", "#8c791e", "#6b7896", "#b56c77"];
const state = ref(initialState());
const openTabs = ref([]);
const search = ref("");
const selectedCollectionId = ref(null);
const dropCollectionId = ref(null);
const mobileTabsOpen = ref(false);
const toast = ref("");
const collectionDialog = ref(null);
const linkDialog = ref(null);
const collectionName = ref("");
const chosenColor = ref(colors[0]);
const editingCollectionId = ref(null);
const linkCollectionId = ref(null);
const linkUrl = ref("");
const linkTitle = ref("");
const urlInput = ref(null);
const searchInput = ref(null);
const tabsList = ref(null);
const dockSizes = ref({});
const dockMedia = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
const visibleCollections = computed(() => selectedCollectionId.value
  ? state.value.collections.filter((entry) => entry.id === selectedCollectionId.value)
  : state.value.collections);
const itemCount = computed(() => state.value.collections.reduce((total, collection) => total + collection.items.length, 0));
const viewCaption = computed(() => visibleCollections.value[0]?.name && selectedCollectionId.value
  ? visibleCollections.value[0].name : "全部收藏");

let dragged = null;
let dragPreview = null;
let dragSource = null;
let toastTimer;
let tabsTimer;

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "网页"; }
}

function initial(url) {
  return hostname(url).charAt(0).toUpperCase();
}

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ""; }, 2600);
}

async function persist() {
  await api.storage.local.set({ [STORAGE_KEY]: toRaw(state.value) });
}

function matches(collection) {
  const term = search.value.trim().toLowerCase();
  return term ? collection.items.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(term)) : collection.items;
}

async function addPage(collectionId, page) {
  const outcome = savePage(state.value, collectionId, page);
  if (outcome.result === "saved") {
    await persist();
    const name = state.value.collections.find((entry) => entry.id === collectionId)?.name;
    showToast(`已保存到「${name}」`);
  } else {
    showToast(outcome.result === "duplicate" ? "这个收藏夹已有该网页" : "无法保存此网页");
  }
}

async function removePage(collectionId, itemId) {
  const collection = state.value.collections.find((entry) => entry.id === collectionId);
  if (!collection) return;
  collection.items = collection.items.filter((item) => item.id !== itemId);
  await persist();
  showToast("已移除网页");
}

function makeDragPreview(event, title, url) {
  if (!event.dataTransfer?.setDragImage) return;
  clearDragPreview();
  const preview = document.createElement("div");
  preview.className = "drag-preview";
  const icon = document.createElement("span");
  icon.className = "favicon";
  icon.textContent = initial(url);
  const label = document.createElement("span");
  label.textContent = title;
  preview.append(icon, label);
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

function startDrag(event, payload, title, url) {
  dragged = payload;
  dragSource = event.currentTarget;
  dragSource.classList.add("dragging");
  event.dataTransfer.effectAllowed = payload.type === "saved" ? "move" : "copy";
  event.dataTransfer.setData("text/uri-list", url);
  event.dataTransfer.setData("text/plain", url);
  makeDragPreview(event, title, url);
}

function stopDrag() {
  dragSource?.classList.remove("dragging");
  dragSource = null;
  dragged = null;
  dropCollectionId.value = null;
  clearDragPreview();
  dockSizes.value = {};
}

function onDragOver(event, collectionId) {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (!dragged && !types.includes("text/uri-list") && !types.includes("text/plain")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = dragged?.type === "saved" ? "move" : "copy";
  dropCollectionId.value = collectionId;
}

function onDragLeave(event, collectionId) {
  if (dropCollectionId.value !== collectionId) return;
  const underPointer = document.elementFromPoint(event.clientX, event.clientY);
  if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.contains(underPointer)) {
    dropCollectionId.value = null;
  }
}

async function onDrop(event, collection) {
  event.preventDefault();
  dropCollectionId.value = null;
  clearDragPreview();
  if (dragged?.type === "saved") {
    const moved = movePage(state.value, dragged.itemId, collection.id);
    dragged = null;
    if (moved) { await persist(); showToast(`已移到「${collection.name}」`); }
    return;
  }
  const tab = dragged?.type === "tab" ? openTabs.value.find((entry) => entry.id === dragged.tabId) : null;
  const raw = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain") || tab?.url || "";
  dragged = null;
  const url = validWebUrl(raw.split(/\r?\n/).find((line) => line && !line.startsWith("#"))?.trim());
  if (!url) { showToast("只支持 http 和 https 网页"); return; }
  await addPage(collection.id, { url, title: tab?.title || hostname(url) });
}

function onDockMove(event) {
  if (event.pointerType !== "mouse" || !dockMedia.matches || dragged) return;
  const levels = {};
  for (const row of tabsList.value.querySelectorAll(".tab-row")) {
    const rect = row.getBoundingClientRect();
    const distance = Math.abs(event.clientY - rect.top - rect.height / 2);
    const proximity = Math.max(0, 1 - distance / 150);
    const focus = proximity * proximity * (3 - 2 * proximity);
    levels[row.dataset.tabId] = {
      "--dock-icon": `${(25 + 11 * focus).toFixed(1)}px`,
      "--dock-title": `${(12 + 2 * focus).toFixed(1)}px`
    };
  }
  dockSizes.value = levels;
}

async function refreshTabs() {
  try {
    const tabs = await api.tabs.query({ currentWindow: true });
    openTabs.value = tabs.filter((tab) => validWebUrl(tab.url));
  } catch {
    showToast("无法读取标签页，请检查扩展权限");
  }
}

function scheduleTabs() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(refreshTabs, 150);
}

async function openCollectionDialog(id = null) {
  editingCollectionId.value = id;
  const collection = state.value.collections.find((entry) => entry.id === id);
  collectionName.value = collection?.name || "";
  chosenColor.value = collection?.color || colors[state.value.collections.length % colors.length];
  collectionDialog.value.showModal();
  await nextTick();
  collectionDialog.value.querySelector("input").focus();
}

async function saveCollection() {
  const name = collectionName.value.trim();
  if (!name) return;
  if (editingCollectionId.value) {
    const collection = state.value.collections.find((entry) => entry.id === editingCollectionId.value);
    if (collection) { collection.name = name; collection.color = chosenColor.value; }
  } else {
    state.value.collections.push({ id: crypto.randomUUID(), name, color: chosenColor.value, items: [] });
  }
  collectionDialog.value.close();
  await persist();
}

async function deleteCollection() {
  const collection = state.value.collections.find((entry) => entry.id === editingCollectionId.value);
  if (!collection || collection.id === "inbox") return;
  const inbox = state.value.collections.find((entry) => entry.id === "inbox");
  for (const item of collection.items) {
    if (!inbox.items.some((entry) => entry.url === item.url)) inbox.items.push(item);
  }
  state.value.collections = state.value.collections.filter((entry) => entry.id !== collection.id);
  if (selectedCollectionId.value === collection.id) selectedCollectionId.value = null;
  collectionDialog.value.close();
  await persist();
  showToast("收藏夹已删除，网页已移到收件箱");
}

async function openLinkDialog(collectionId) {
  linkCollectionId.value = collectionId;
  linkUrl.value = "";
  linkTitle.value = "";
  linkDialog.value.showModal();
  await nextTick();
  urlInput.value.focus();
}

async function saveLink() {
  const url = validWebUrl(linkUrl.value);
  if (!url) { urlInput.value.setCustomValidity("请输入 http 或 https 网址"); urlInput.value.reportValidity(); return; }
  linkDialog.value.close();
  await addPage(linkCollectionId.value, { url, title: linkTitle.value.trim() || hostname(url) });
}

function onKeydown(event) {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.value.focus();
  }
}

function onStorageChanged(changes, area) {
  if (area === "local" && changes[STORAGE_KEY]?.newValue) {
    state.value = normalizeState(changes[STORAGE_KEY].newValue);
  }
}

const tabEvents = [api.tabs.onCreated, api.tabs.onRemoved, api.tabs.onUpdated, api.tabs.onActivated];

onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  api.storage.onChanged.addListener(onStorageChanged);
  for (const event of tabEvents) event.addListener(scheduleTabs);
  try {
    const stored = await api.storage.local.get(STORAGE_KEY);
    state.value = normalizeState(stored[STORAGE_KEY]);
    await refreshTabs();
  } catch {
    showToast("扩展初始化失败，请重新打开标签页");
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  api.storage.onChanged.removeListener?.(onStorageChanged);
  for (const event of tabEvents) event.removeListener?.(scheduleTabs);
  clearTimeout(toastTimer);
  clearTimeout(tabsTimer);
  clearDragPreview();
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar glass-panel" aria-label="收藏导航">
      <div class="brand"><span class="brand-mark" aria-hidden="true">G</span><span>Gather Tabs</span></div>
      <div class="sidebar-search">
        <Search :size="16" aria-hidden="true" />
        <label for="search" class="sr-only">搜索收藏</label>
        <input id="search" ref="searchInput" v-model="search" type="search" placeholder="搜索收藏" autocomplete="off" />
        <kbd>/</kbd>
      </div>
      <div class="sidebar-section-label">工作区</div>
      <nav class="collection-nav">
        <button type="button" class="nav-item" :class="{ active: selectedCollectionId === null }" @click="selectedCollectionId = null">
          <LayoutGrid :size="15" aria-hidden="true" /><span>全部收藏</span>
        </button>
        <button v-for="collection in state.collections" :key="collection.id" type="button" class="nav-item"
          :class="{ active: selectedCollectionId === collection.id, 'drop-active': dropCollectionId === collection.id }"
          @click="selectedCollectionId = collection.id" @dragover="onDragOver($event, collection.id)"
          @dragleave="onDragLeave($event, collection.id)" @drop="onDrop($event, collection)">
          <span class="nav-dot" :style="{ backgroundColor: collection.color }" aria-hidden="true"></span>
          <span class="nav-label">{{ collection.name }}</span><span class="nav-count">{{ collection.items.length }}</span>
        </button>
      </nav>
      <button type="button" class="sidebar-add" @click="openCollectionDialog()"><Plus :size="16" aria-hidden="true" /> 新建收藏夹</button>
      <div class="sidebar-foot"><span class="local-dot" aria-hidden="true"></span> 保存在此浏览器</div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div><div class="eyebrow">你的网页工作台</div><h1>我的收藏</h1></div>
        <div class="topbar-actions"><span class="count-label">{{ state.collections.length }} 个收藏夹</span>
          <button type="button" class="primary-button" @click="openCollectionDialog()"><Plus :size="16" aria-hidden="true" />新建收藏夹</button>
        </div>
      </header>
      <div class="main-toolbar">
        <div class="view-caption">{{ viewCaption }}</div>
        <div class="toolbar-right"><span>{{ itemCount }} 个网页</span>
          <button type="button" class="quiet-button toggle-tabs" aria-controls="open-tabs" @click="mobileTabsOpen = true"><PanelRightOpen :size="16" aria-hidden="true" />打开的标签页</button>
        </div>
      </div>
      <div class="collections" aria-live="polite">
        <section v-for="collection in visibleCollections" :key="collection.id" class="collection-section"
          :class="{ 'drop-active': dropCollectionId === collection.id }"
          @dragover="onDragOver($event, collection.id)" @dragleave="onDragLeave($event, collection.id)" @drop="onDrop($event, collection)">
          <div class="collection-heading">
            <div class="collection-title-wrap"><span class="collection-dot" :style="{ backgroundColor: collection.color }" aria-hidden="true"></span>
              <h2>{{ collection.name }}</h2><span class="collection-total">{{ collection.items.length }}</span>
            </div>
            <div class="collection-actions"><button type="button" class="text-button" @click="openLinkDialog(collection.id)"><Plus :size="15" aria-hidden="true" />添加网页</button>
              <button type="button" class="icon-button" :aria-label="`编辑${collection.name}`" :title="`编辑${collection.name}`" @click="openCollectionDialog(collection.id)"><MoreHorizontal :size="18" aria-hidden="true" /></button>
            </div>
          </div>
          <div class="cards-grid">
            <article v-for="item in matches(collection)" :key="item.id" class="link-card" draggable="true"
              @dragstart="startDrag($event, { type: 'saved', itemId: item.id }, item.title, item.url)" @dragend="stopDrag">
              <a class="card-link" :href="item.url" target="_blank" rel="noopener noreferrer"><span class="favicon" aria-hidden="true">{{ initial(item.url) }}</span>
                <span class="card-text"><strong>{{ item.title }}</strong><small>{{ hostname(item.url) }}</small></span></a>
              <button type="button" class="card-remove" :aria-label="`移除 ${item.title}`" title="移除网页" @click="removePage(collection.id, item.id)"><X :size="15" aria-hidden="true" /></button>
            </article>
            <div v-if="matches(collection).length === 0" class="empty-collection">{{ search ? '没有匹配的网页' : '暂无网页' }}</div>
          </div>
        </section>
      </div>
    </main>

    <aside id="open-tabs" class="tabs-panel glass-panel" :class="{ 'mobile-open': mobileTabsOpen }" aria-label="打开的标签页">
      <div class="tabs-header"><div><div class="eyebrow">当前窗口</div><h2>打开的标签页</h2></div>
        <div class="tabs-header-actions"><span class="tab-count">{{ openTabs.length }}</span>
          <button type="button" class="icon-button close-tabs" aria-label="关闭标签页列表" title="关闭标签页列表" @click="mobileTabsOpen = false"><X :size="18" aria-hidden="true" /></button>
        </div>
      </div>
      <div ref="tabsList" class="tabs-list" @pointermove="onDockMove" @pointerleave="dockSizes = {}" @scroll="dockSizes = {}">
        <p v-if="!openTabs.length" class="empty-tabs">这个窗口还没有可保存的网页</p>
        <div v-for="tab in openTabs" :key="tab.id" class="tab-row" :data-tab-id="tab.id" :style="dockSizes[tab.id]" :title="tab.title || hostname(tab.url)" draggable="true"
          @dragstart="startDrag($event, { type: 'tab', tabId: tab.id }, tab.title || hostname(tab.url), tab.url)" @dragend="stopDrag">
          <span class="favicon" aria-hidden="true">{{ initial(tab.url) }}</span>
          <span class="tab-copy"><strong>{{ tab.title || hostname(tab.url) }}</strong><small>{{ hostname(tab.url) }}</small></span>
          <button type="button" class="tab-save" :aria-label="`保存 ${tab.title || hostname(tab.url)} 到收件箱`" title="保存到收件箱" @click="addPage('inbox', tab)"><Plus :size="17" aria-hidden="true" /></button>
        </div>
      </div>
      <div class="tabs-footer"><button type="button" class="quiet-button" @click="refreshTabs"><RefreshCw :size="15" aria-hidden="true" />刷新列表</button></div>
    </aside>

    <dialog ref="collectionDialog" class="collection-dialog">
      <form method="dialog" @submit.prevent="saveCollection">
        <div class="dialog-heading"><h2>{{ editingCollectionId ? '编辑收藏夹' : '新建收藏夹' }}</h2>
          <button type="button" class="icon-button" aria-label="关闭" @click="collectionDialog.close()"><X :size="18" aria-hidden="true" /></button></div>
        <label for="collection-name">名称</label><input id="collection-name" v-model="collectionName" maxlength="40" required placeholder="例如：设计灵感" />
        <div class="color-label">颜色</div>
        <div class="color-picker" role="group" aria-label="收藏夹颜色">
          <button v-for="color in colors" :key="color" type="button" class="color-swatch" :class="{ chosen: chosenColor === color }"
            :style="{ backgroundColor: color }" :aria-label="`颜色 ${color}`" :aria-pressed="chosenColor === color" @click="chosenColor = color"></button>
        </div>
        <div class="dialog-actions"><button v-if="editingCollectionId && editingCollectionId !== 'inbox'" type="button" class="danger-button" @click="deleteCollection">删除收藏夹</button>
          <span class="spacer"></span><button type="submit" class="primary-button">保存</button></div>
      </form>
    </dialog>
    <dialog ref="linkDialog" class="collection-dialog">
      <form method="dialog" @submit.prevent="saveLink">
        <div class="dialog-heading"><h2>添加网页</h2><button type="button" class="icon-button" aria-label="关闭" @click="linkDialog.close()"><X :size="18" aria-hidden="true" /></button></div>
        <label for="link-url">网址</label><input id="link-url" ref="urlInput" v-model="linkUrl" type="url" required placeholder="https://example.com" @input="urlInput.setCustomValidity('')" />
        <label for="link-title">标题 <span class="optional">选填</span></label><input id="link-title" v-model="linkTitle" maxlength="160" placeholder="网页标题" />
        <div class="dialog-actions"><span class="spacer"></span><button type="submit" class="primary-button"><Bookmark :size="15" aria-hidden="true" />添加网页</button></div>
      </form>
    </dialog>
    <div class="toast" :class="{ visible: toast }" role="status" aria-live="polite">{{ toast }}</div>
  </div>
</template>
