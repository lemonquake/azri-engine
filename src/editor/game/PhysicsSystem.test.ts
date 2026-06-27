import { describe, it, expect } from 'vitest';
import Matter from 'matter-js';
import { PhysicsSystem, type TileWorldRect } from './PhysicsSystem';

const SIZE = 32;

/** Minimal collision tile rect; `tile` only needs id/grid/hasCollision for these tests. */
function tileRect(id: string, gridX: number, gridY: number, hasCollision = true): TileWorldRect {
    return {
        tile: { id, gridX, gridY, hasCollision } as any,
        x: gridX * SIZE,
        y: gridY * SIZE,
        width: SIZE,
        height: SIZE,
    };
}

function floorRow(cols: number, gridY: number, idPrefix = 'tile_') {
    const rects: TileWorldRect[] = [];
    // Use an id that contains underscores — this is the real generateTileId() shape and the
    // exact case that broke getGroundedState's id parsing.
    for (let gx = 0; gx <= cols; gx++) rects.push(tileRect(`${idPrefix}${gx}_${gridY}`, gx, gridY));
    return rects;
}

/** Mirror GameRunner: push the player down and let Matter resolve against the world. */
function settle(phys: PhysicsSystem, player: Matter.Body, steps: number) {
    for (let i = 0; i < steps; i++) {
        Matter.Body.setVelocity(player, { x: 0, y: 600 / 60 });
        Matter.Engine.update(phys.engine, 16);
    }
}

describe('PhysicsSystem — world construction', () => {
    it('startWorld adds a static body per collision tile', () => {
        const phys = new PhysicsSystem();
        expect(Matter.Composite.allBodies(phys.world).length).toBe(0);

        phys.startWorld(floorRow(5, 10), []);
        const tileBodies = Matter.Composite.allBodies(phys.world).filter(b => b.label.startsWith('tile_'));
        expect(tileBodies.length).toBe(6); // gx 0..5
    });

    it('skips tiles without collision', () => {
        const phys = new PhysicsSystem();
        phys.startWorld([tileRect('tile_a', 0, 0, true), tileRect('tile_b', 1, 0, false)], []);
        expect(Matter.Composite.allBodies(phys.world).filter(b => b.label.startsWith('tile_')).length).toBe(1);
    });
});

describe('PhysicsSystem — grounding (the P0 regression)', () => {
    const startX = 2 * SIZE;
    const startYAboveFloor = 320 - 28 - 40; // 40px above a floor whose top is y=320

    it('player falls through when the world has no tile bodies (the original bug)', () => {
        const phys = new PhysicsSystem();
        const player = phys.createPlayerBody(startX, startYAboveFloor, 20, 28);
        settle(phys, player, 30);
        expect(phys.getGroundedState(player, 20, 28).isGrounded).toBe(false);
        expect(player.position.y).toBeGreaterThan(320); // kept falling past the floor
    });

    it('player lands and is grounded once startWorld populates the tiles', () => {
        const phys = new PhysicsSystem();
        phys.startWorld(floorRow(5, 10), []);
        const player = phys.createPlayerBody(startX, startYAboveFloor, 20, 28);
        settle(phys, player, 30);
        expect(phys.getGroundedState(player, 20, 28).isGrounded).toBe(true);
    });

    it('resolves the ground tile id even when ids contain underscores (the split bug)', () => {
        const phys = new PhysicsSystem();
        phys.startWorld(floorRow(5, 10), []);
        const player = phys.createPlayerBody(startX, startYAboveFloor, 20, 28);
        settle(phys, player, 30);
        const { groundTileRect } = phys.getGroundedState(player, 20, 28);
        expect(groundTileRect).not.toBeNull();
        expect(groundTileRect!.tile.id).toBe('tile_2_10'); // the tile under the player
    });
});

describe('PhysicsSystem — AABB + shape collision', () => {
    it('checkCollision detects overlap with a collision tile and ignores gaps', () => {
        const phys = new PhysicsSystem();
        const rects = floorRow(2, 0);
        expect(phys.checkCollision({ x: 10, y: 4, width: 8, height: 8 }, rects)).toBe(true);
        expect(phys.checkCollision({ x: 10, y: 500, width: 8, height: 8 }, rects)).toBe(false);
    });

    it('checkCollisionShapes detects overlap with a box collision shape', () => {
        const phys = new PhysicsSystem();
        const shapes = [{ type: 'box', id: 's1', x: 100, y: 100, width: 50, height: 50 } as any];
        phys.startWorld([], shapes);
        expect(phys.checkCollisionShapes({ x: 110, y: 110, width: 10, height: 10 }, shapes)).toBe(true);
        expect(phys.checkCollisionShapes({ x: 400, y: 400, width: 10, height: 10 }, shapes)).toBe(false);
    });

    it('reuses one probe body per collider size (perf optimization)', () => {
        const phys = new PhysicsSystem();
        const a = (phys as any).getProbeBody(20, 28);
        const b = (phys as any).getProbeBody(20, 28);
        const c = (phys as any).getProbeBody(16, 80);
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});

describe('PhysicsSystem — kinematic bodies for moving/floating tiles', () => {
    const floatTile = (): TileWorldRect => ({
        tile: { id: 'tile_f', gridX: 2, gridY: 10, hasCollision: true, behavior: { type: 'floating' } } as any,
        x: 64, y: 320, width: 32, height: 32,
    });

    it('registers a floating tile as a repositionable (dynamic) body, not a static one', () => {
        const phys = new PhysicsSystem();
        phys.startWorld([floatTile()], []);
        const bodies = Matter.Composite.allBodies(phys.world);
        expect(bodies.some(b => b.label === 'dynamic_tile_f')).toBe(true);
        expect(bodies.some(b => b.label === 'tile_tile_f')).toBe(false);
        expect(phys.dynamicBodies.has('tile_f')).toBe(true);
    });

    it('player grounding follows the tile after updateDynamicBody moves it (collision tracks the sprite)', () => {
        const phys = new PhysicsSystem();
        phys.startWorld([floatTile()], []);
        // Simulate one frame of bob+sink moving the platform down by 10px.
        phys.updateDynamicBody('tile_f', 64, 330, 32, 32, 0, 0);
        const player = phys.createPlayerBody(64, 330 - 28, 20, 28);
        for (let i = 0; i < 30; i++) {
            Matter.Body.setVelocity(player, { x: 0, y: 10 });
            Matter.Engine.update(phys.engine, 16);
        }
        const { isGrounded, groundTileRect } = phys.getGroundedState(player, 20, 28);
        expect(isGrounded).toBe(true);
        expect(groundTileRect?.tile.id).toBe('tile_f');
    });
});

describe('Player Jump State Logic', () => {
    it('sets jumpCount = 1 on first jump, then 2 on double jump, and resets on landing', () => {
        let isGrounded = true;
        let jumpCount = 0;
        let rotation = 0;
        let isOnWall = false;

        // Reset jump count when grounded (runs at start of frame)
        function updateStartFrame() {
            if (isGrounded) {
                jumpCount = 0;
                rotation = 0;
            } else {
                if (jumpCount === 0 && !isOnWall) {
                    jumpCount = 1;
                }
            }
        }

        // Trigger jump (runs during input handling)
        function handleJumpInput() {
            if (isGrounded) {
                isGrounded = false;
                jumpCount = 1;
            } else if (jumpCount < 2) {
                jumpCount += 1;
                rotation = 1; // spin
            }
        }

        // 1. Grounded state
        updateStartFrame();
        expect(jumpCount).toBe(0);

        // 2. First jump
        handleJumpInput();
        expect(isGrounded).toBe(false);
        expect(jumpCount).toBe(1);

        // 3. Next frame (in air)
        updateStartFrame();
        expect(jumpCount).toBe(1);

        // 4. Double jump
        handleJumpInput();
        expect(jumpCount).toBe(2);
        expect(rotation).toBe(1);

        // 5. Next frame (in air)
        updateStartFrame();
        expect(jumpCount).toBe(2);

        // 6. Land on ground
        isGrounded = true;
        updateStartFrame();
        expect(jumpCount).toBe(0);
        expect(rotation).toBe(0);
    });

    it('sets jumpCount = 1 immediately when falling off a ledge, allowing only 1 mid-air jump', () => {
        let isGrounded = true;
        let jumpCount = 0;
        let rotation = 0;
        let isOnWall = false;

        function updateStartFrame() {
            if (isGrounded) {
                jumpCount = 0;
                rotation = 0;
            } else {
                if (jumpCount === 0 && !isOnWall) {
                    jumpCount = 1;
                }
            }
        }

        function handleJumpInput() {
            if (isGrounded) {
                isGrounded = false;
                jumpCount = 1;
            } else if (jumpCount < 2) {
                jumpCount += 1;
                rotation = 1; // spin
            }
        }

        // Walk off ledge
        isGrounded = false;
        
        // Frame starts
        updateStartFrame();
        expect(jumpCount).toBe(1); // Spending first jump due to ledge fall

        // Try to jump in mid-air (this is the double-jump)
        handleJumpInput();
        expect(jumpCount).toBe(2);
        expect(rotation).toBe(1);

        // Frame starts again
        updateStartFrame();
        expect(jumpCount).toBe(2);

        // Try to jump again (blocked, since jumpCount is 2)
        handleJumpInput();
        expect(jumpCount).toBe(2); // remains 2, cannot jump again
    });
});

describe('PhysicsSystem — player properties & resizing', () => {
    it('creates a player body with 0 friction and 0 frictionStatic', () => {
        const phys = new PhysicsSystem();
        const player = phys.createPlayerBody(100, 100, 20, 28);
        expect(player.friction).toBe(0);
        expect(player.frictionStatic).toBe(0);
    });

    it('resizes a player body while retaining velocity', () => {
        const phys = new PhysicsSystem();
        let playerBody = phys.createPlayerBody(100, 100, 20, 28);
        Matter.Body.setVelocity(playerBody, { x: 3, y: -4 });

        // Simulate resizePlayerBody logic:
        const velocity = { x: playerBody.velocity.x, y: playerBody.velocity.y };
        const position = { x: playerBody.position.x, y: playerBody.position.y };
        Matter.World.remove(phys.world, playerBody);
        
        playerBody = phys.createPlayerBody(position.x - 20 / 2, position.y - 18 / 2, 20, 18);
        Matter.Body.setVelocity(playerBody, velocity);

        expect(playerBody.velocity.x).toBe(3);
        expect(playerBody.velocity.y).toBe(-4);
        
        const height = playerBody.bounds.max.y - playerBody.bounds.min.y;
        expect(height).toBeCloseTo(18, 0);
    });

    it('does not ground the player when colliding with a vertical wall', () => {
        const phys = new PhysicsSystem();
        const wallTile: TileWorldRect = {
            tile: { id: 'tile_wall', gridX: 1, gridY: 10, hasCollision: true } as any,
            x: 32, y: 320, width: 32, height: 32
        };
        phys.startWorld([wallTile], []);
        
        const player = phys.createPlayerBody(73 - 10, 336 - 14, 20, 28);
        
        for (let i = 0; i < 5; i++) {
            Matter.Body.setVelocity(player, { x: -5, y: 0 });
            Matter.Engine.update(phys.engine, 16);
        }
        
        const { isGrounded } = phys.getGroundedState(player, 20, 28);
        expect(isGrounded).toBe(false);
    });
});

