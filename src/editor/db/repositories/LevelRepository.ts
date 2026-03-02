
import dbService from '../DatabaseService';

export interface LevelEntity {
    id: string;
    name: string;
    width: number;
    height: number;
    tiles_data: string; // JSON
    characters_data: string; // JSON
    layers_data: string; // JSON
    skybox_data: string; // JSON
    collision_data: string; // JSON
    level_images_data: string; // JSON
    physics_data: string; // JSON
    tilesheets_data: string; // JSON
    tile_defs_data: string; // JSON
    created_at: number;
    updated_at: number;
}

export class LevelRepository {
    private static instance: LevelRepository;

    private constructor() { }

    public static getInstance(): LevelRepository {
        if (!LevelRepository.instance) {
            LevelRepository.instance = new LevelRepository();
        }
        return LevelRepository.instance;
    }

    public getAll(): Pick<LevelEntity, 'id' | 'name' | 'updated_at'>[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            const stmt = db.prepare("SELECT id, name, updated_at FROM levels ORDER BY updated_at DESC");
            const result: Pick<LevelEntity, 'id' | 'name' | 'updated_at'>[] = [];
            while (stmt.step()) {
                result.push(stmt.getAsObject() as unknown as Pick<LevelEntity, 'id' | 'name' | 'updated_at'>);
            }
            stmt.free();
            return result;
        } catch (e) {
            console.error("Failed to fetch levels:", e);
            return [];
        }
    }

    public getById(id: string): LevelEntity | null {
        const db = dbService.getDatabase();
        if (!db) return null;

        try {
            const stmt = db.prepare("SELECT * FROM levels WHERE id = :id");
            const result = stmt.getAsObject({ ':id': id }) as unknown as LevelEntity;
            stmt.free();
            if (!result.id) return null;
            return result;
        } catch (e) {
            console.error(`Failed to fetch level ${id}:`, e);
            return null;
        }
    }

    public create(level: Omit<LevelEntity, 'created_at' | 'updated_at'>): void {
        const db = dbService.getDatabase();
        if (!db) return;

        const now = Date.now();
        try {
            db.run(`
                INSERT INTO levels (id, name, width, height, tiles_data, characters_data, layers_data, skybox_data, collision_data, level_images_data, physics_data, tilesheets_data, tile_defs_data, created_at, updated_at)
                VALUES (:id, :name, :w, :h, :tiles, :chars, :layers, :skybox, :collision, :images, :physics, :tilesheets, :tiledefs, :created, :updated)
            `, {
                ':id': level.id,
                ':name': level.name,
                ':w': level.width,
                ':h': level.height,
                ':tiles': level.tiles_data,
                ':chars': level.characters_data,
                ':layers': level.layers_data,
                ':skybox': level.skybox_data || '[]',
                ':collision': level.collision_data || '[]',
                ':images': level.level_images_data || '[]',
                ':physics': level.physics_data || '{}',
                ':tilesheets': level.tilesheets_data || '[]',
                ':tiledefs': level.tile_defs_data || '[]',
                ':created': now,
                ':updated': now
            });
            dbService.commit();
        } catch (e) {
            console.error("Failed to save level:", e);
            throw e;
        }
    }

    public update(id: string, updates: Partial<LevelEntity>): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            const fields = Object.keys(updates).filter(k => k !== 'id').map(k => `${k} = :${k}`).join(', ');
            if (!fields) return;

            const params: any = { ':id': id, ':updated_at': Date.now() };
            Object.entries(updates).forEach(([k, v]) => {
                if (k !== 'id') params[`:${k}`] = v;
            });

            db.run(`UPDATE levels SET ${fields}, updated_at = :updated_at WHERE id = :id`, params);
            dbService.commit();
        } catch (e) {
            console.error(`Failed to update level ${id}:`, e);
            throw e;
        }
    }

    public delete(id: string): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            db.run("DELETE FROM levels WHERE id = :id", { ':id': id });
            dbService.commit();
        } catch (e) {
            console.error(`Failed to delete level ${id}:`, e);
            throw e;
        }
    }
}

export default LevelRepository.getInstance();
