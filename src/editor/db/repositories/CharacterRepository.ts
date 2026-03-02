
import dbService from '../DatabaseService';

export interface CharacterProperties {
    hasCollision: boolean;
    hasGravity: boolean;
    npcType: 'idle' | 'roam' | 'path' | 'follow'; // Added 'follow' as a common type
    health: number;
    mana: number;
    isEnemy: boolean;
}

export const DEFAULT_CHARACTER_PROPERTIES: CharacterProperties = {
    hasCollision: true,
    hasGravity: true,
    npcType: 'idle',
    health: 100,
    mana: 0,
    isEnemy: false,
};

export interface CharacterEntity {
    id: string;
    name: string;
    metadata: string; // JSON string of CharacterProperties
    created_at: number;
    updated_at: number;
}

export interface CharacterAnimationEntity {
    character_id: string;
    animation_type: string;
    animation_id: string;
}

export class CharacterRepository {
    private static instance: CharacterRepository;

    private constructor() { }

    public static getInstance(): CharacterRepository {
        if (!CharacterRepository.instance) {
            CharacterRepository.instance = new CharacterRepository();
        }
        return CharacterRepository.instance;
    }

    public getAll(): CharacterEntity[] {
        const db = dbService.getDatabase();
        if (!db) return [];

        try {
            const stmt = db.prepare("SELECT * FROM characters ORDER BY updated_at DESC");
            const result: CharacterEntity[] = [];
            while (stmt.step()) {
                result.push(stmt.getAsObject() as unknown as CharacterEntity);
            }
            stmt.free();
            return result;
        } catch (e) {
            console.error("Failed to fetch characters:", e);
            return [];
        }
    }

    public getById(id: string): CharacterEntity | null {
        const db = dbService.getDatabase();
        if (!db) return null;

        try {
            const stmt = db.prepare("SELECT * FROM characters WHERE id = :id");
            const result = stmt.getAsObject({ ':id': id }) as unknown as CharacterEntity;
            stmt.free();
            // check if empty object returned (sql.js behavior)
            if (!result.id) return null;
            return result;
        } catch (e) {
            console.error(`Failed to fetch character ${id}:`, e);
            return null;
        }
    }

    public create(character: Omit<CharacterEntity, 'created_at' | 'updated_at'>): void {
        const db = dbService.getDatabase();
        if (!db) return;

        const now = Date.now();
        try {
            db.run(`
                INSERT INTO characters (id, name, metadata, created_at, updated_at)
                VALUES (:id, :name, :metadata, :created_at, :updated_at)
            `, {
                ':id': character.id,
                ':name': character.name,
                ':metadata': character.metadata || JSON.stringify(DEFAULT_CHARACTER_PROPERTIES),
                ':created_at': now,
                ':updated_at': now
            });
            dbService.commit();
        } catch (e) {
            console.error("Failed to create character:", e);
            throw e;
        }
    }

    public update(id: string, updates: Partial<CharacterEntity>): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            // Build dynamic query
            const fields = Object.keys(updates).filter(k => k !== 'id').map(k => `${k} = :${k}`).join(', ');
            if (!fields) return;

            const params: any = { ':id': id, ':updated_at': Date.now() };
            Object.entries(updates).forEach(([k, v]) => {
                if (k !== 'id') params[`:${k}`] = v;
            });

            db.run(`UPDATE characters SET ${fields}, updated_at = :updated_at WHERE id = :id`, params);
            dbService.commit();
        } catch (e) {
            console.error(`Failed to update character ${id}:`, e);
            throw e;
        }
    }

    public delete(id: string): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            db.run("DELETE FROM characters WHERE id = :id", { ':id': id });
            dbService.commit();
        } catch (e) {
            console.error(`Failed to delete character ${id}:`, e);
            throw e;
        }
    }

    // --- Animation Assignments ---

    public getAnimations(characterId: string): Record<string, string> {
        const db = dbService.getDatabase();
        if (!db) return {};

        try {
            const stmt = db.prepare("SELECT animation_type, animation_id FROM character_animations WHERE character_id = :id");
            const result: Record<string, string> = {};
            while (stmt.step()) {
                const row = stmt.getAsObject();
                result[row.animation_type as string] = row.animation_id as string;
            }
            stmt.free();
            return result;
        } catch (e) {
            console.error(`Failed to fetch animations for ${characterId}:`, e);
            return {};
        }
    }

    public setAnimation(characterId: string, type: string, animationId: string | null): void {
        const db = dbService.getDatabase();
        if (!db) return;

        try {
            if (animationId) {
                db.run(`
                    INSERT INTO character_animations (character_id, animation_type, animation_id)
                    VALUES (:cid, :type, :aid)
                    ON CONFLICT(character_id, animation_type) 
                    DO UPDATE SET animation_id = :aid
                `, {
                    ':cid': characterId,
                    ':type': type,
                    ':aid': animationId
                });
            } else {
                db.run("DELETE FROM character_animations WHERE character_id = :cid AND animation_type = :type", {
                    ':cid': characterId,
                    ':type': type
                });
            }
            dbService.commit();
        } catch (e) {
            console.error(`Failed to set animation ${type} for ${characterId}:`, e);
            throw e;
        }
    }
}

export default CharacterRepository.getInstance();
