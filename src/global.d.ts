export {};

declare global {
  interface Window {
    electronAPI?: {
      selectDirectory: () => Promise<string | null>;
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
      getAppPath: () => Promise<string>;
      getDroppedPath: (filePath: string) => Promise<{ exists: boolean; isDirectory: boolean; path: string }>;
    };
  }
}
