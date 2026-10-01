const extensionApi = globalThis.browser ?? globalThis.chrome;

extensionApi.action.onClicked.addListener(() => {
  const page = extensionApi.runtime.getManifest().chrome_url_overrides.newtab;
  extensionApi.tabs.create({ url: extensionApi.runtime.getURL(page) });
});
