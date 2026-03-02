
import dbService from '../DatabaseService';
import type { Animation, SpriteSheet } from '../../characterMaster/types';

export class AssetRepository {
    private static instance: AssetRepository;

    private constructor() { }

    public static getInstance(): AssetRepository {
        if (!AssetRepository.instance) {
            AssetRepository.instance = new AssetRepository();
        }
        return AssetRepository.instance;
    }

    // --- Animations ---

    public saveAnimation(animation: Animation): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            db.run(`
                INSERT OR REPLACE INTO animations (id, name, type, data, created_at)
                VALUES (:id, :name, :type, :data, :created_at)
            `, {
                ':id': animation.id,
                ':name': animation.name,
                ':type': 'custom', // TODO: Determine type from naming or logic
                ':data': JSON.stringify(animation),
                ':created_at': Date.now()
            });
            dbService.commit();
        } catch (e) {
            console.error("Failed to save animation:", e);
        }
    }

    public getAnimation(id: string): Animation | null {
        const db = dbService.getDatabase();
        if (!db) return null;

        try {
            const stmt = db.prepare("SELECT data FROM animations WHERE id = :id");
            if (stmt.step()) {
                const data = stmt.getAsObject().data as string;
                stmt.free();
                return JSON.parse(data);
            }
            stmt.free();
            return null;
        } catch (e) {
            console.error(`Failed to load animation ${id}:`, e);
            return null;
        }
    }

    public getAllAnimations(): Animation[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            const stmt = db.prepare("SELECT data FROM animations");
            const result: Animation[] = [];
            while (stmt.step()) {
                const data = stmt.getAsObject().data as string;
                result.push(JSON.parse(data));
            }
            stmt.free();
            return result;
        } catch (e) {
            console.error("Failed to load all animations:", e);
            return [];
        }
    }

    // --- Sprite Sheets ---

    public deleteAnimation(id: string): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            db.run("DELETE FROM animations WHERE id = :id", { ':id': id });
            // Also clean up any character assignments for this animation?
            // Optional but good practice:
            db.run("UPDATE character_animations SET animation_id = NULL WHERE animation_id = :id", { ':id': id });
            dbService.commit();
        } catch (e) {
            console.error(`Failed to delete animation ${id}:`, e);
            throw e;
        }
    }

    // --- Sprite Sheets ---

    public saveSpriteSheet(sheet: SpriteSheet, imageDataBase64?: string): void {
        // ... existing save implementation ...
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            const params: any = {
                ':id': sheet.id,
                ':name': sheet.name,
                ':config': JSON.stringify(sheet),
                ':created_at': Date.now()
            };

            if (imageDataBase64) {
                db.run(`
                    INSERT OR REPLACE INTO sprite_sheets (id, name, image_data, config, created_at)
                    VALUES (:id, :name, :image_data, :config, :created_at)
                `, {
                    ...params,
                    ':image_data': imageDataBase64
                });
            } else {
                db.run(`
                    UPDATE sprite_sheets 
                    SET name = :name, config = :config 
                    WHERE id = :id
                `, {
                    ':id': sheet.id,
                    ':name': sheet.name,
                    ':config': JSON.stringify(sheet)
                });
            }
            dbService.commit();
        } catch (e) {
            console.error("Failed to save sprite sheet:", e);
        }
    }

    public deleteSpriteSheet(id: string): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            db.run("DELETE FROM sprite_sheets WHERE id = :id", { ':id': id });
            dbService.commit();
        } catch (e) {
            console.error(`Failed to delete sprite sheet ${id}:`, e);
            throw e;
        }
    }

    public getSpriteSheet(id: string): { sheet: SpriteSheet, imageData: string } | null {
        const db = dbService.getDatabase();
        if (!db) return null;

        try {
            const stmt = db.prepare("SELECT config, image_data FROM sprite_sheets WHERE id = :id");
            if (stmt.step()) {
                const row = stmt.getAsObject();
                const sheet = JSON.parse(row.config as string);
                const imageData = row.image_data as string;
                stmt.free();
                return { sheet, imageData };
            }
            stmt.free();
            return null;
        } catch (e) {
            console.error(`Failed to load sprite sheet ${id}:`, e);
            return null;
        }
    }

    public getAllSpriteSheets(): SpriteSheet[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            // Only fetch config, not heavy blobs
            const stmt = db.prepare("SELECT config FROM sprite_sheets");
            const result: SpriteSheet[] = [];
            while (stmt.step()) {
                const data = stmt.getAsObject().config as string;
                result.push(JSON.parse(data));
            }
            stmt.free();
            return result;
        } catch (e) {
            console.error("Failed to load all sprite sheets:", e);
            return [];
        }
    }
}

export default AssetRepository.getInstance();
