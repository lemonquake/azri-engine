
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

class DatabaseService {
    private db: Database | null = null;
    private SQL: SqlJsStatic | null = null;
    private static instance: DatabaseService;
    private isElectron = false;

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
            // Detect Electron via the contextBridge API (works with contextIsolation:true).
            const api = (window as any).electronAPI;
            if (typeof window !== 'undefined' && api?.isElectron) {
                this.isElectron = true;
            }

            // Load the sql.js wasm file. In Electron, resolve an absolute path via the bridge
            // (avoids cwd issues); in the browser, load it relative to the page.
            this.SQL = await initSqlJs({
                locateFile: file => {
                    const bridge = (window as any).electronAPI;
                    if (this.isElectron && bridge?.getWasmPath) {
                        return bridge.getWasmPath(file);
                    }
                    return `./${file}`;
                }
            });

            let databaseData: Uint8Array | null = null;

            if (this.isElectron) {
                try {
                    const fileData = await api.readDbFile();
                    if (fileData) {
                        databaseData = new Uint8Array(fileData);
                        console.log("Database loaded from file.");
                    }
                } catch (e) {
                    console.warn("Electron DB file read failed; falling back to IndexedDB.", e);
                    databaseData = await this.loadFromIndexedDB();
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

        if (this.isElectron) {
            try {
                const api = (window as any).electronAPI;
                await api.writeDbFile(data);
                return;
            } catch (e) {
                console.error("Failed to write DB file; falling back to IndexedDB.", e);
                // fall through to IndexedDB persistence below
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
