export { };

declare global {
    interface Window {
        electronAPI: {
            getArgv: () => string[];
            isPackaged: () => boolean;
        };
    }
}
