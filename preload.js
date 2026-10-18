const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = name => (...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld('api', {
  state: call('state'),
  unlock: call('unlock'),
  list: call('list'),
  lock: call('lock'),
  import: call('import'),
  export: call('export'),
  remove: call('remove'),
  addNote: call('addNote'),
  update: call('update'),
  addFolder: call('addFolder'),
  removeFolder: call('removeFolder'),
  pathOf: file => webUtils.getPathForFile(file),
});
