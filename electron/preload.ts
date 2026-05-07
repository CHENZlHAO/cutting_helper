import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('select-file', filters),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getDroppedPath: (filePath: string) => ipcRenderer.invoke('get-dropped-path', filePath),
});
