
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

class DatabaseService {
    private db: Database | null = null;
    private SQL: SqlJsStatic | null = null;
    private static instance: DatabaseService;
    private isElectron = false;
    private fs: any = null;
    private dbFilePath: string | null = null;

    private constructor() { }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    public async init(): Promise<void> {
        if (this.db) return;

        try {
            // Check if in Electron first so we can use IPC for pathing
            if (typeof window !== 'undefined' && (window as any).require) {
                try {
                    const ipcRenderer = (window as any).require('electron').ipcRenderer;
                    const path = (window as any).require('path');
                    this.fs = (window as any).require('fs');
                    const userDataPath = ipcRenderer.sendSync('get-user-data-path');
                    this.dbFilePath = path.join(userDataPath, 'azri_engine_db.sqlite');
                    this.isElectron = true;
                } catch (e) {
                    console.log("Not running in Electron or nodeIntegration disabled", e);
                }
            }

            // Load wasm file from public folder or CDN
            this.SQL = await initSqlJs({
                // Locate the wasm file. Use absolute path in Electron to avoid cwd issues.
                locateFile: file => {
                    if (this.isElectron) {
                        const path = (window as any).require('path');
                        const ipcRenderer = (window as any).require('electron').ipcRenderer;
                        const appPath = ipcRenderer.sendSync('get-app-path');
                        const isPackaged = ipcRenderer.sendSync('is-packaged');

                        // In production, appPath is resources/app.asar and file is in dist/
                        // In dev, appPath is project root and file is in public/
                        return isPackaged
                            ? path.join(appPath, 'dist', file)
                            : path.join(appPath, 'public', file);
                    }
                    return `./${file}`;
                }
            });

            let databaseData: Uint8Array | null = null;

            if (this.isElectron && this.fs && this.dbFilePath) {
                if (this.fs.existsSync(this.dbFilePath)) {
                    databaseData = new Uint8Array(this.fs.readFileSync(this.dbFilePath));
                    console.log("Database loaded from file.");
                }
            } else {
                databaseData = await this.loadFromIndexedDB();
                if (databaseData) console.log("Database loaded from IndexedDB persistence.");
            }

            if (databaseData) {
                this.db = new this.SQL.Database(databaseData);
                console.log("Database loaded.");
            } else {
                this.db = new this.SQL.Database();
                console.log("New database created.");
            }

            this.initSchema();

            // Auto-save on window unload
            window.addEventListener('beforeunload', () => {
                this.commit();
            });

            // Auto-save periodically
            setInterval(() => this.commit(), 30000);

        } catch (err) {
            console.error("Failed to initialize database:", err);
            throw err;
        }
    }

    private initSchema() {
        if (!this.db) return;

        // Define tables
        const schema = `
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER,
                updated_at INTEGER,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS animations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT, -- 'idle', 'walk', 'jump', etc.
                data TEXT, -- JSON string of animation data
                created_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS character_animations (
                character_id TEXT NOT NULL,
                animation_type TEXT NOT NULL, -- 'idle', 'walk_front', etc.
                animation_id TEXT,
                FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
                FOREIGN KEY(animation_id) REFERENCES animations(id)
            );
            
            CREATE UNIQUE INDEX IF NOT EXISTS idx_char_anim 
            ON character_animations(character_id, animation_type);

            CREATE TABLE IF NOT EXISTS sprite_sheets (
                id TEXT PRIMARY KEY,
                name TEXT,
                image_data BLOB, -- Original image data
                config TEXT,     -- JSON string of sprite sheet config (rows, cols, etc.)
                created_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS levels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                tiles_data TEXT, -- JSON string of tiles
                characters_data TEXT, -- JSON string of characters
                layers_data TEXT, -- JSON string of layers
                skybox_data TEXT, -- JSON string of skybox layers
                collision_data TEXT, -- JSON string of collision shapes
                level_images_data TEXT, -- JSON string of placed images (props)
                physics_data TEXT, -- JSON string of physics settings
                tilesheets_data TEXT, -- JSON string of imported custom tilesheets
                tile_defs_data TEXT, -- JSON string of custom tile definitions (available tiles)
                created_at INTEGER,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS prefabs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT,
                preview_image TEXT,
                data TEXT,
                created_at INTEGER,
                updated_at INTEGER
            );
        `;

        this.db.run(schema);

        // Migrations
        try {
            this.db.run("ALTER TABLE levels ADD COLUMN layers_data TEXT;");
        } catch (e) {
            // Column likely exists or table just created, ignore
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN collision_data TEXT;");
        } catch (e) {
            // Column likely exists or table just created, ignore
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN skybox_data TEXT;");
        } catch (e) {
            // Column likely exists
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN level_images_data TEXT;");
        } catch (e) {
            // Column likely exists
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN physics_data TEXT;");
        } catch (e) {
            // Column likely exists
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN tilesheets_data TEXT;");
        } catch (e) {
            // Column likely exists
        }

        try {
            this.db.run("ALTER TABLE levels ADD COLUMN tile_defs_data TEXT;");
        } catch (e) {
            // Column likely exists
        }

        this.commit();
    }

    public getDatabase(): Database | null {
        return this.db;
    }

    public exportDatabase(): Uint8Array | null {
        if (!this.db) return null;
        return this.db.export();
    }

    public importDatabase(data: Uint8Array): void {
        if (!this.SQL) return;
        this.db?.close();
        this.db = new this.SQL.Database(data);
        this.commit();
    }

    // --- Persistence via IndexedDB ---

    public async commit(): Promise<void> {
        if (!this.db) return;
        const data = this.db.export();

        if (this.isElectron && this.fs && this.dbFilePath) {
            try {
                this.fs.writeFileSync(this.dbFilePath, Buffer.from(data));
                return Promise.resolve();
            } catch (e) {
                console.error("Failed to write to DB file:", e);
                return Promise.reject(e);
            }
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open("AzriEngineDB", 1);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains("sqlite")) {
                    db.createObjectStore("sqlite");
                }
            };

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const tx = db.transaction("sqlite", "readwrite");
                const store = tx.objectStore("sqlite");
                store.put(data, "latest");

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    private async loadFromIndexedDB(): Promise<Uint8Array | null> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("AzriEngineDB", 1);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains("sqlite")) {
                    db.createObjectStore("sqlite");
                }
            };

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const tx = db.transaction("sqlite", "readonly");
                const store = tx.objectStore("sqlite");
                const getRequest = store.get("latest");

                getRequest.onsuccess = () => {
                    resolve(getRequest.result as Uint8Array || null);
                };

                getRequest.onerror = () => reject(getRequest.error);
            };

            request.onerror = () => {
                // Determine if error is simply "DB doesn't exist yet" which is fine
                resolve(null);
            };
        });
    }
}

export default DatabaseService.getInstance();
