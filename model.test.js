import assert from "node:assert/strict";
import test from "node:test";
import { initialState, movePage, normalizeState, savePage } from "./model.js";

test("save and move pages without duplicates", () => {
  const state = initialState();
  const page = { url: "https://example.com/", title: "Example" };
  assert.equal(savePage(state, "inbox", page).result, "saved");
  assert.equal(savePage(state, "inbox", page).result, "duplicate");
  const itemId = state.collections[0].items[0].id;
  assert.equal(movePage(state, itemId, "reading"), true);
  assert.equal(state.collections[0].items.length, 0);
  assert.equal(state.collections[1].items.length, 1);
  assert.equal(movePage(state, itemId, "reading"), false);
});

test("normalize legacy default colors and preserve custom colors", () => {
  const state = normalizeState({ collections: [
    { id: "inbox", color: "#dc665f" },
    { id: "reading", color: "#358479" },
    { id: "projects", color: "#6673ae" },
    { id: "custom", color: "#123456" }
  ] });
  assert.deepEqual(state.collections.map((collection) => collection.color), [
    "#98697e", "#76578a", "#8c791e", "#123456"
  ]);
});
