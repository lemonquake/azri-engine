
import type { Tile } from '../types';

export interface BoxCollider {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Runtime world-position for a tile (may differ from grid for moving/floating tiles) */
export interface TileWorldRect {
    tile: Tile;
    x: number;
    y: number;
    width: number;
    height: number;
}

export class PhysicsSystem {
    private gravity = 800;
    private tileSize: number;

    constructor(tileSize: number) {
        this.tileSize = tileSize;
    }

    /** Simple AABB overlap test */
    private aabb(a: BoxCollider, b: { x: number; y: number; width: number; height: number }): boolean {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
        );
    }

    /** Check if rect collides with ANY collision tile (using world rects) */
    public checkCollision(rect: BoxCollider, tileRects: TileWorldRect[]): boolean {
        for (const tr of tileRects) {
            if (!tr.tile.hasCollision) continue;
            if (this.aabb(rect, tr)) return true;
        }
        return false;
    }

    /** Legacy overload: check collision using raw Tile[] (grid-based positions) */
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

    /** Return the first colliding tile (world-rect aware) */
    public getCollidingTile(rect: BoxCollider, tileRects: TileWorldRect[]): TileWorldRect | null {
        for (const tr of tileRects) {
            if (!tr.tile.hasCollision) continue;
            if (this.aabb(rect, tr)) return tr;
        }
        return null;
    }

    /** Return the tile directly below the player (ground check) */
    public getGroundTile(playerRect: BoxCollider, tileRects: TileWorldRect[]): TileWorldRect | null {
        // Check a thin rect just below the player feet
        const feetRect: BoxCollider = {
            x: playerRect.x + 2,
            y: playerRect.y + playerRect.height,
            width: playerRect.width - 4,
            height: 2
        };
        return this.getCollidingTile(feetRect, tileRects);
    }

    public applyGravity(velocity: { x: number, y: number }, deltaTime: number): void {
        velocity.y += this.gravity * deltaTime;
    }

    // ─── Generic Shape Collision ───

    public checkCollisionShapes(rect: BoxCollider, shapes: import('../types').CollisionShape[]): boolean {
        for (const shape of shapes) {
            if (shape.type === 'box') {
                // Box AABB
                if (this.aabb(rect, shape)) return true;
            } else if (shape.type === 'circle') {
                // Circle vs AABB
                if (this.circleRect(shape, rect)) return true;
            } else if (shape.type === 'polygon') {
                // Polygon SAT
                if (this.polygonRect(shape, rect)) return true;
            }
        }
        return false;
    }

    private circleRect(circle: { x: number, y: number, radius: number }, rect: BoxCollider): boolean {
        // Find closest point on rect to circle center
        const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

        const dx = circle.x - closestX;
        const dy = circle.y - closestY;

        return (dx * dx + dy * dy) < (circle.radius * circle.radius);
    }

    private pointInRect(p: { x: number, y: number }, rect: BoxCollider): boolean {
        return p.x >= rect.x && p.x <= rect.x + rect.width &&
            p.y >= rect.y && p.y <= rect.y + rect.height;
    }

    private pointInPolygon(point: { x: number, y: number }, vs: { x: number, y: number }[]): boolean {
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private lineLineIntersect(p1: { x: number, y: number }, p2: { x: number, y: number }, p3: { x: number, y: number }, p4: { x: number, y: number }): boolean {
        const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
        if (det === 0) return false;

        const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
        const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;

        return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
    }

    private lineRectIntersect(p1: { x: number, y: number }, p2: { x: number, y: number }, r: BoxCollider): boolean {
        // Quick AABB rejection
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        if (maxX < r.x || minX > r.x + r.width || maxY < r.y || minY > r.y + r.height) {
            return false;
        }

        // If either point is inside the rect, they intersect
        if (this.pointInRect(p1, r) || this.pointInRect(p2, r)) return true;

        // Otherwise check line intersection with the 4 edges of rect
        const r1 = { x: r.x, y: r.y };
        const r2 = { x: r.x + r.width, y: r.y };
        const r3 = { x: r.x + r.width, y: r.y + r.height };
        const r4 = { x: r.x, y: r.y + r.height };

        if (this.lineLineIntersect(p1, p2, r1, r2)) return true;
        if (this.lineLineIntersect(p1, p2, r2, r3)) return true;
        if (this.lineLineIntersect(p1, p2, r3, r4)) return true;
        if (this.lineLineIntersect(p1, p2, r4, r1)) return true;

        return false;
    }

    private polygonRect(poly: { x: number, y: number, vertices: { x: number, y: number }[] }, rect: BoxCollider): boolean {
        if (poly.vertices.length < 3) return false;

        // Transform polygon vertices to world space
        const polyVerts = poly.vertices.map(v => ({ x: poly.x + v.x, y: poly.y + v.y }));

        // 1. Check if any polygon edge intersects the rectangle
        for (let i = 0; i < polyVerts.length; i++) {
            const p1 = polyVerts[i];
            const p2 = polyVerts[(i + 1) % polyVerts.length];
            if (this.lineRectIntersect(p1, p2, rect)) return true;
        }

        // 2. Check if the rectangle is entirely inside the polygon
        const rectCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        if (this.pointInPolygon(rectCenter, polyVerts)) return true;

        // 3. Check if the polygon is entirely inside the rectangle
        // (Since no edges intersect, checking one vertex is sufficient)
        if (this.pointInRect(polyVerts[0], rect)) return true;

        return false;
    }
}
