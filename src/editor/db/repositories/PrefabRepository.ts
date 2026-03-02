import dbService from '../DatabaseService';

export interface PrefabEntity {
    id: string;
    name: string;
    category: string;
    preview_image: string; // Base64
    data: string; // JSON string of prefab items array (e.g. {tiles: [], characters: []})
    created_at: number;
    updated_at: number;
}

export class PrefabRepository {
    public getAll(): PrefabEntity[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            const stmt = db.prepare("SELECT * FROM prefabs ORDER BY created_at DESC");
            const prefabs: PrefabEntity[] = [];
            while (stmt.step()) {
                const row = stmt.getAsObject() as unknown as PrefabEntity;
                prefabs.push(row);
            }
            stmt.free();
            return prefabs;
        } catch (e) {
            console.error("Failed to get prefabs", e);
            return [];
        }
    }

    public getByCategory(category: string): PrefabEntity[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            const stmt = db.prepare("SELECT * FROM prefabs WHERE category = :category ORDER BY created_at DESC");
            stmt.bind({ ':category': category });
            const prefabs: PrefabEntity[] = [];
            while (stmt.step()) {
                const row = stmt.getAsObject() as unknown as PrefabEntity;
                prefabs.push(row);
            }
            stmt.free();
            return prefabs;
        } catch (e) {
            console.error("Failed to get prefabs by category", e);
            return [];
        }
    }

    public getById(id: string): PrefabEntity | null {
        const db = dbService.getDatabase();
        if (!db) return null;

        try {
            const stmt = db.prepare("SELECT * FROM prefabs WHERE id = :id");
            stmt.bind({ ':id': id });
            if (stmt.step()) {
                const row = stmt.getAsObject() as unknown as PrefabEntity;
                stmt.free();
                return row;
            }
            stmt.free();
            return null;
        } catch (e) {
            console.error("Failed to get prefab", e);
            return null;
        }
    }

    public create(data: PrefabEntity): boolean {
        const db = dbService.getDatabase();
        if (!db) return false;

        try {
            const now = Date.now();
            const sql = `
                INSERT INTO prefabs (id, name, category, preview_image, data, created_at, updated_at)
                VALUES (:id, :name, :category, :preview_image, :data, :created_at, :updated_at)
            `;
            db.run(sql, {
                ':id': data.id,
                ':name': data.name,
                ':category': data.category || 'General',
                ':preview_image': data.preview_image || '',
                ':data': data.data,
                ':created_at': now,
                ':updated_at': now
            });
            dbService.commit();
            return true;
        } catch (e) {
            console.error("Failed to create prefab", e);
            return false;
        }
    }

    public update(id: string, updates: Partial<PrefabEntity>): boolean {
        const db = dbService.getDatabase();
        if (!db) return false;

        try {
            const current = this.getById(id);
            if (!current) return false;

            const updated = { ...current, ...updates, updated_at: Date.now() };

            const sql = `
                UPDATE prefabs SET 
                    name = :name,
                    category = :category,
                    preview_image = :preview_image,
                    data = :data,
                    updated_at = :updated_at
                WHERE id = :id
            `;
            db.run(sql, {
                ':id': id,
                ':name': updated.name,
                ':category': updated.category,
                ':preview_image': updated.preview_image,
                ':data': updated.data,
                ':updated_at': updated.updated_at
            });
            dbService.commit();
            return true;
        } catch (e) {
            console.error("Failed to update prefab", e);
            return false;
        }
    }

    public delete(id: string): boolean {
        const db = dbService.getDatabase();
        if (!db) return false;

        try {
            db.run("DELETE FROM prefabs WHERE id = :id", { ':id': id });
            dbService.commit();
            return true;
        } catch (e) {
            console.error("Failed to delete prefab", e);
            return false;
        }
    }
}

export default new PrefabRepository();
