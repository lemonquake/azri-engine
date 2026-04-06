import Matter from 'matter-js';
import type { Tile, CollisionShape } from '../types';

export interface BoxCollider {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TileWorldRect {
    tile: Tile;
    x: number;
    y: number;
    width: number;
    height: number;
}

export class PhysicsSystem {
    public engine: Matter.Engine;
    public world: Matter.World;
    private tileSize: number;
    
    // Mapping for logic
    public tileRectsCache: TileWorldRect[] = [];
    public dynamicBodies: Map<string, Matter.Body> = new Map();

    constructor(tileSize: number) {
        this.tileSize = tileSize;
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        
        // We will control player gravity manually for precision
        this.engine.gravity.x = 0;
        this.engine.gravity.y = 0;
        this.engine.gravity.scale = 0;
    }

    public clear() {
        Matter.World.clear(this.world, false);
        Matter.Engine.clear(this.engine);
        this.tileRectsCache = [];
        this.dynamicBodies.clear();
    }

    // ─── Build World ───

    public startWorld(tileRects: TileWorldRect[], shapes: CollisionShape[]) {
        this.clear();
        this.tileRectsCache = tileRects;

        const bodies: Matter.Body[] = [];

        // Add Tiles
        for (const tr of tileRects) {
            if (!tr.tile.hasCollision) continue;
            const cx = tr.x + tr.width / 2;
            const cy = tr.y + tr.height / 2;
            
            // If it's a moving tile, make it kinematic basically
            const isMoving = tr.tile.behavior?.type === 'moving' || tr.tile.behavior?.type === 'transitioning';
            
            const body = Matter.Bodies.rectangle(cx, cy, tr.width, tr.height, {
                isStatic: true,
                friction: 0.1,
                label: isMoving ? `dynamic_${tr.tile.id}` : `tile_${tr.tile.id}`
            });
            bodies.push(body);

            if (isMoving) {
                this.dynamicBodies.set(tr.tile.id, body);
            }
        }

        // Add Shapes
        for (const shape of shapes) {
            if (shape.type === 'box') {
                const cx = shape.x + shape.width / 2;
                const cy = shape.y + shape.height / 2;
                const body = Matter.Bodies.rectangle(cx, cy, shape.width, shape.height, {
                    isStatic: true,
                    angle: (shape.rotation || 0) * Math.PI / 180,
                    friction: 0.1,
                    label: `shape_${shape.id || 'box'}`
                });
                bodies.push(body);
            } else if (shape.type === 'circle') {
                const body = Matter.Bodies.circle(shape.x, shape.y, shape.radius, {
                    isStatic: true,
                    friction: 0.1,
                    label: `shape_${shape.id || 'circle'}`
                });
                bodies.push(body);
            } else if (shape.type === 'polygon') {
                const verts = shape.vertices.map(v => ({ x: shape.x + v.x, y: shape.y + v.y }));
                const centroid = Matter.Vertices.centre(verts);
                const body = Matter.Bodies.fromVertices(centroid.x, centroid.y, [verts], {
                    isStatic: true,
                    friction: 0.1,
                    label: `shape_${shape.id || 'poly'}`
                }, true);
                if (body) {
                    Matter.Body.setPosition(body, centroid);
                    bodies.push(body);
                }
            }
        }

        Matter.World.add(this.world, bodies);
    }

    public createPlayerBody(x: number, y: number, width: number, height: number): Matter.Body {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const body = Matter.Bodies.rectangle(cx, cy, width, Math.max(height, 4), {
            inertia: Infinity,
            friction: 0,
            frictionAir: 0,
            restitution: 0,
            chamfer: { radius: 4 },
            label: 'player'
        });
        Matter.World.add(this.world, body);
        return body;
    }

    public updateDynamicBody(tileId: string, x: number, y: number, width: number, height: number, velocityX: number, velocityY: number) {
        const body = this.dynamicBodies.get(tileId);
        if (body) {
            Matter.Body.setPosition(body, { x: x + width / 2, y: y + height / 2 });
            Matter.Body.setVelocity(body, { x: velocityX, y: velocityY });
        }
    }

    public getGroundedState(playerBody: Matter.Body, width: number, height: number) {
        const bounds = {
            min: { x: playerBody.position.x - width / 2 + 2, y: playerBody.position.y + height / 2 },
            max: { x: playerBody.position.x + width / 2 - 2, y: playerBody.position.y + height / 2 + 4 }
        };
        const allBodies = Matter.Composite.allBodies(this.world);
        const collisions = Matter.Query.region(allBodies, bounds).filter(b => b !== playerBody && !b.isSensor);
        
        let groundTile = null;
        for (const b of collisions) {
            if (b.label.startsWith('tile_') || b.label.startsWith('dynamic_')) {
                const id = b.label.split('_')[1];
                const tr = this.tileRectsCache.find(t => t.tile.id === id);
                if (tr) {
                    groundTile = tr;
                    break;
                }
            }
        }
        
        return {
            isGrounded: collisions.length > 0,
            groundTileRect: groundTile
        };
    }

    // ─── Legacy Wrapper Helpers (For Enemies/Attacks) ───
    
    // Quick AABB overlap test
    private aabb(a: BoxCollider, b: { x: number; y: number; width: number; height: number }): boolean {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
        );
    }

    public checkCollision(rect: BoxCollider, tileRects: TileWorldRect[]): boolean {
        for (const tr of tileRects) {
            if (!tr.tile.hasCollision) continue;
            if (this.aabb(rect, tr)) return true;
        }
        return false;
    }

    public checkCollisionLegacy(rect: BoxCollider, tiles: Tile[]): boolean {
        for (const tile of tiles) {
            if (!tile.hasCollision) continue;
            const tileRect = {
                x: tile.gridX * this.tileSize,
                y: tile.gridY * this.tileSize,
                width: this.tileSize,
                height: this.tileSize
            };
            if (this.aabb(rect, tileRect)) return true;
        }
        return false;
    }

    public getCollidingTile(rect: BoxCollider, tileRects: TileWorldRect[]): TileWorldRect | null {
        for (const tr of tileRects) {
            if (!tr.tile.hasCollision) continue;
            if (this.aabb(rect, tr)) return tr;
        }
        return null;
    }

    public getGroundTile(playerRect: BoxCollider, tileRects: TileWorldRect[]): TileWorldRect | null {
        const feetRect: BoxCollider = {
            x: playerRect.x + 2,
            y: playerRect.y + playerRect.height,
            width: playerRect.width - 4,
            height: 2
        };
        return this.getCollidingTile(feetRect, tileRects);
    }

    public checkCollisionShapes(rect: BoxCollider, shapes: CollisionShape[]): boolean {
        if (!shapes || shapes.length === 0) return false;
        const bounds = {
            min: { x: rect.x, y: rect.y },
            max: { x: rect.x + rect.width, y: rect.y + rect.height }
        };
        const allBodies = Matter.Composite.allBodies(this.world);
        const regionBodies = Matter.Query.region(allBodies, bounds).filter(b => b.label.startsWith('shape_'));
        
        if (regionBodies.length === 0) return false;
        
        const tempRect = Matter.Bodies.rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height);
        for (const b of regionBodies) {
            if (Matter.Collision.collides(tempRect, b) !== null) return true;
        }
        return false;
    }

    public applyGravity(velocity: { x: number, y: number }, deltaTime: number): void {
        velocity.y += 800 * deltaTime;
    }
}
