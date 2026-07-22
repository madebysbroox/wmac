const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paymentTrackerUpdates", {
  getStatus: () => ipcRenderer.invoke("updates:get-status"),
  check: () => ipcRenderer.invoke("updates:check"),
  install: () => ipcRenderer.invoke("updates:install"),
  onStatus: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  }
});

contextBridge.exposeInMainWorld("paymentTrackerProviders", {
  list: (provider) => ipcRenderer.invoke("providers:list", provider),
  sync: (provider) => ipcRenderer.invoke("providers:sync", provider),
  updateStatus: (provider, paymentId, patch) => ipcRenderer.invoke("providers:update-status", provider, paymentId, patch),
  createSquareMonthlyInvoice: (input) => ipcRenderer.invoke("providers:create-square-monthly-invoice", input),
  getSettings: () => ipcRenderer.invoke("providers:get-settings"),
  saveSquareRelay: (settings) => ipcRenderer.invoke("providers:save-square-relay", settings)
});
