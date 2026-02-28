const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getApiToken: () => ipcRenderer.sendSync("get-api-token"),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
