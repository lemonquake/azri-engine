export { };

declare global {
    interface Window {
        electronAPI?: {
            isElectron?: boolean;
            isPackaged: () => boolean;
            getAppPath?: () => string;
            getUserDataPath?: () => string;
            getWasmPath?: (file: string) => string;
            readMaps?: () => Promise<any[]>;
            importMap?: () => Promise<any>;
            readDbFile?: () => Promise<Uint8Array | null>;
            writeDbFile?: (data: Uint8Array) => Promise<boolean>;
        };
    }
}
