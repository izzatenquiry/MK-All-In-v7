const { contextBridge, shell, ipcRenderer } = require('electron');

/** Desktop shell flag (selari dengan brandConfig `veolyElectron`) */
contextBridge.exposeInMainWorld('veolyElectron', {
  isDesktopShell: true,
});

/** API sedia ada untuk renderer */
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  openExternal: (url) => {
    shell.openExternal(url);
  },
  restartBridge6003: async () => {
    return await ipcRenderer.invoke('veoly:restart-bridge', { port: 6003 });
  },
});
