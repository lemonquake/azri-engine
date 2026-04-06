/**
 * TileSpriteCache - Pre-renders SVG tile animations as canvas bitmaps.
 * 
 * Instead of rendering individual React/SVG DOM components per tile (which kills
 * performance with hundreds of tiles), this module rasterizes each tile type into
 * a set of animation frames on offscreen canvases. Consumers just call:
 * 
 *   TileSpriteCache.getFrame('lava', time)  → OffscreenCanvas
 *   TileSpriteCache.getFrame('water_surface', time)  → OffscreenCanvas
 * 
 * Then stamp it with ctx.drawImage() — one draw call per tile, zero DOM overhead.
 */

const FRAME_COUNT = 16;
const TILE_SIZE = 32; // Matches SVG viewBox 0 0 32 32
const ANIMATION_DURATION = 4; // seconds for a full cycle

// Cache storage: spriteId → array of OffscreenCanvas frames
const frameCache = new Map<string, OffscreenCanvas[]>();

// Global time tracking - we don't need per-tile rAF, just read performance.now()
let initialized = false;

// ─── Drawing helpers ─────────────────────────────────────────────────────

function createFrame(): OffscreenCanvas {
    return new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

// ─── LAVA frames ─────────────────────────────────────────────────────────

function generateLavaFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT; // 0..1 normalized time

        // Base color pulses between #ff4500 and #ff6a00
        const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2;
        const r = 255;
        const g = Math.round(lerp(69, 106, pulse));
        const b = 0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, 32, 32);

        // Flowing magma lines
        ctx.strokeStyle = '#ff2a00';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;

        // Flow line 1
        ctx.beginPath();
        const flow1Offset = Math.sin(t * Math.PI * 2) * 2;
        ctx.moveTo(0, 8 + flow1Offset);
        ctx.quadraticCurveTo(8, 4 + flow1Offset, 16, 12 + flow1Offset);
        ctx.quadraticCurveTo(24, 8 + flow1Offset, 32, 8 + flow1Offset);
        ctx.stroke();

        // Flow line 2
        ctx.beginPath();
        const flow2Offset = Math.sin(t * Math.PI * 2 + 1) * 2;
        ctx.moveTo(0, 20 + flow2Offset);
        ctx.quadraticCurveTo(12, 26 + flow2Offset, 20, 18 + flow2Offset);
        ctx.quadraticCurveTo(28, 22 + flow2Offset, 32, 22 + flow2Offset);
        ctx.stroke();

        // Flow line 3 (vertical)
        ctx.beginPath();
        const flow3Offset = Math.sin(t * Math.PI * 2 + 2) * 2;
        ctx.moveTo(8 + flow3Offset, 0);
        ctx.quadraticCurveTo(14 + flow3Offset, 10, 8 + flow3Offset, 20);
        ctx.quadraticCurveTo(10 + flow3Offset, 28, 12 + flow3Offset, 32);
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Bubbles with phase offsets
        const bubbles = [
            { cx: 6, cy: 14, r: 2, phase: 0, speed: 2 },
            { cx: 24, cy: 8, r: 1.5, phase: 1, speed: 3 },
            { cx: 16, cy: 24, r: 2.5, phase: 0.5, speed: 2.5 },
            { cx: 28, cy: 28, r: 1, phase: 1.5, speed: 2 },
        ];

        for (const bubble of bubbles) {
            const bPhase = (t * bubble.speed + bubble.phase) % 1;
            // Scale: 0→0, 0.2→1, 0.8→1.2, 1→0 (matching CSS keyframes)
            let scale: number;
            let alpha: number;
            if (bPhase < 0.2) {
                scale = bPhase / 0.2;
                alpha = bPhase / 0.2;
            } else if (bPhase < 0.8) {
                const subT = (bPhase - 0.2) / 0.6;
                scale = lerp(1, 1.2, subT);
                alpha = lerp(1, 0.8, subT);
            } else {
                const subT = (bPhase - 0.8) / 0.2;
                scale = lerp(1.2, 1.5, subT);
                alpha = lerp(0.8, 0, subT);
            }

            const colors = ['#ff9d00', '#ffae00', '#ffe600', '#ff9d00'];
            ctx.globalAlpha = alpha;
            ctx.fillStyle = colors[bubbles.indexOf(bubble) % colors.length];
            ctx.beginPath();
            ctx.arc(bubble.cx, bubble.cy, bubble.r * scale, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        frames.push(canvas);
    }
    return frames;
}

// ─── WATER (body) frames ─────────────────────────────────────────────────

function generateWaterBodyFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT;

        // Base - bob opacity
        const bobAlpha = lerp(0.7, 1, (Math.sin(t * Math.PI * 2) + 1) / 2);
        ctx.globalAlpha = bobAlpha;
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(0, 0, 32, 32);

        // Sub-surface line 1
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#a1d2ff';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        const waveOffset1 = Math.sin(t * Math.PI * 2 + 1) * 4;
        ctx.beginPath();
        ctx.moveTo(4 + waveOffset1, 16);
        ctx.quadraticCurveTo(10 + waveOffset1, 14, 16 + waveOffset1, 16);
        ctx.quadraticCurveTo(22 + waveOffset1, 18, 28 + waveOffset1, 16);
        ctx.stroke();

        // Sub-surface line 2
        ctx.globalAlpha = 0.3;
        const waveOffset2 = Math.sin(t * Math.PI * 2 + 2.5) * 4;
        ctx.beginPath();
        ctx.moveTo(8 + waveOffset2, 26);
        ctx.quadraticCurveTo(16 + waveOffset2, 24, 24 + waveOffset2, 26);
        ctx.stroke();

        ctx.globalAlpha = 1;
        frames.push(canvas);
    }
    return frames;
}

// ─── WATER (surface) frames ──────────────────────────────────────────────

function generateWaterSurfaceFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT;

        // Base - bob opacity
        const bobAlpha = lerp(0.7, 1, (Math.sin(t * Math.PI * 2) + 1) / 2);
        ctx.globalAlpha = bobAlpha;
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(0, 0, 32, 32);

        // Surface highlight (animated translateY)
        ctx.globalAlpha = 1;
        const surfaceY = Math.sin(t * Math.PI * 2) * 2;
        ctx.fillStyle = '#4faeff';
        ctx.beginPath();
        ctx.moveTo(0, 6 + surfaceY);
        ctx.quadraticCurveTo(8, 2 + surfaceY, 16, 6 + surfaceY);
        ctx.quadraticCurveTo(24, 10 + surfaceY, 32, 6 + surfaceY);
        ctx.lineTo(32, 10 + surfaceY);
        ctx.lineTo(0, 10 + surfaceY);
        ctx.closePath();
        ctx.fill();

        // Surface line (animated translateX)  
        ctx.strokeStyle = '#a1d2ff';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        const waveX = Math.sin(t * Math.PI * 2) * 4;
        ctx.beginPath();
        ctx.moveTo(-4 + waveX, 4);
        ctx.quadraticCurveTo(8 + waveX, 0, 16 + waveX, 4);
        ctx.quadraticCurveTo(28 + waveX, 8, 36 + waveX, 4);
        ctx.stroke();

        // Sub-surface details (same as body)
        ctx.globalAlpha = 0.5;
        const waveOffset1 = Math.sin(t * Math.PI * 2 + 1) * 4;
        ctx.beginPath();
        ctx.moveTo(4 + waveOffset1, 16);
        ctx.quadraticCurveTo(10 + waveOffset1, 14, 16 + waveOffset1, 16);
        ctx.quadraticCurveTo(22 + waveOffset1, 18, 28 + waveOffset1, 16);
        ctx.stroke();

        ctx.globalAlpha = 0.3;
        const waveOffset2 = Math.sin(t * Math.PI * 2 + 2.5) * 4;
        ctx.beginPath();
        ctx.moveTo(8 + waveOffset2, 26);
        ctx.quadraticCurveTo(16 + waveOffset2, 24, 24 + waveOffset2, 26);
        ctx.stroke();

        ctx.globalAlpha = 1;
        frames.push(canvas);
    }
    return frames;
}

// ─── CRYSTAL frames ──────────────────────────────────────────────────────

function generateCrystalFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT;

        // Float offset (translateY -3px)
        const floatY = Math.sin(t * Math.PI * 2) * 3;

        ctx.save();
        ctx.translate(0, floatY);

        // Glow opacity - pulsing
        const glowAlpha = lerp(0.9, 1, (Math.sin(t * Math.PI * 2) + 1) / 2);
        ctx.globalAlpha = glowAlpha;

        // Crystal shards
        // Shard 1 - main diamond
        ctx.fillStyle = '#c54dff';
        ctx.beginPath();
        ctx.moveTo(16, 2);
        ctx.lineTo(22, 14);
        ctx.lineTo(16, 28);
        ctx.lineTo(10, 14);
        ctx.closePath();
        ctx.fill();

        // Shard 2 - bottom left
        ctx.fillStyle = '#b32ce6';
        ctx.beginPath();
        ctx.moveTo(10, 14);
        ctx.lineTo(16, 28);
        ctx.lineTo(6, 22);
        ctx.lineTo(4, 16);
        ctx.closePath();
        ctx.fill();

        // Shard 3 - bottom right
        ctx.fillStyle = '#b32ce6';
        ctx.beginPath();
        ctx.moveTo(22, 14);
        ctx.lineTo(28, 16);
        ctx.lineTo(26, 22);
        ctx.lineTo(16, 28);
        ctx.closePath();
        ctx.fill();

        // Highlight 1
        ctx.globalAlpha = glowAlpha * 0.7;
        ctx.fillStyle = '#e8a6ff';
        ctx.beginPath();
        ctx.moveTo(16, 4);
        ctx.lineTo(18, 14);
        ctx.lineTo(16, 24);
        ctx.closePath();
        ctx.fill();

        // Highlight 2
        ctx.globalAlpha = glowAlpha * 0.4;
        ctx.fillStyle = '#e8a6ff';
        ctx.beginPath();
        ctx.moveTo(8, 16);
        ctx.lineTo(12, 18);
        ctx.lineTo(14, 24);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        frames.push(canvas);
    }
    return frames;
}

// ─── GRASS frames ────────────────────────────────────────────────────────

function generateGrassFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT;

        // Clear (transparent background - grass overlays the ground)
        ctx.clearRect(0, 0, 32, 32);

        // Sway angle per blade with phase offsets
        const blades = [
            { path: 'M 6 32 Q 4 20 2 12 Q 7 16 8 32 Z', fill: '#1e7a1e', phase: 0 },
            { path: 'M 26 32 Q 28 20 30 14 Q 25 18 24 32 Z', fill: '#208520', phase: 0.5 },
            { path: 'M 12 32 Q 10 15 14 6 Q 18 16 20 32 Z', fill: '#2ea62e', phase: 1 },
            { path: 'M 18 32 Q 22 22 26 16 Q 16 22 14 32 Z', fill: '#39c439', phase: 1.5 },
            { path: 'M 8 32 Q 10 24 6 16 Q 12 24 14 32 Z', fill: '#1bcf1b', phase: 0 },
        ];

        for (const blade of blades) {
            // Sway: 0→0°, 25→3°, 50→0°, 75→-3° (matching CSS)
            const swayT = (t + blade.phase / ANIMATION_DURATION) % 1;
            const swayAngle = Math.sin(swayT * Math.PI * 2) * 3;

            ctx.save();
            // Rotate from bottom center of each blade
            ctx.translate(16, 32);
            ctx.rotate(swayAngle * Math.PI / 180);
            ctx.translate(-16, -32);

            ctx.fillStyle = blade.fill;
            const path = new Path2D(blade.path);
            ctx.fill(path);
            ctx.restore();
        }

        frames.push(canvas);
    }
    return frames;
}

// ─── GROUND frames (Static dirt + pulsing highlight) ───────────────────────

function generateGroundFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / FRAME_COUNT; // 0..1 normalized time for a 4s loop

        // Base dirt
        ctx.fillStyle = '#614022';
        ctx.fillRect(0, 0, 32, 32);

        // Shadows
        ctx.fillStyle = '#4a301a';
        ctx.beginPath();
        ctx.rect(4, 4, 2, 2);
        ctx.rect(24, 8, 2, 2);
        ctx.rect(12, 20, 2, 2);
        ctx.rect(28, 26, 2, 2);
        ctx.rect(2, 24, 2, 2);
        ctx.fill();

        // Highlight 1 (no animation)
        ctx.fillStyle = '#7d522c';
        const p1 = new Path2D('M 6 12 Q 10 10 14 14 T 22 16 T 28 12 L 28 14 Q 22 18 14 16 T 6 14 Z');
        ctx.fill(p1);

        // Highlight 2 (pulsing outline, delayed by 1s (0.25 time))
        const pulseT = ((t - 0.25 + 1.0) % 1.0) * Math.PI * 2;
        const pulse = 0.95 + 0.05 * Math.sin(pulseT);
        ctx.globalAlpha = pulse;
        const p2 = new Path2D('M -2 28 Q 6 24 16 30 T 34 26 L 34 28 Q 16 32 6 26 T -2 30 Z');
        ctx.fill(p2);
        
        ctx.globalAlpha = 1.0;
        frames.push(canvas);
    }
    return frames;
}

// ─── Grass "rustle" frames (stronger sway for player interaction) ────────

function generateGrassRustleFrames(): OffscreenCanvas[] {
    const frames: OffscreenCanvas[] = [];
    const rustleFrameCount = 16; // More frames for smoother animation

    for (let i = 0; i < rustleFrameCount; i++) {
        const canvas = createFrame();
        const ctx = canvas.getContext('2d')!;
        const t = i / rustleFrameCount;

        ctx.clearRect(0, 0, 32, 32);

        const blades = [
            { path: 'M 6 32 Q 4 20 2 12 Q 7 16 8 32 Z', fill: '#1e7a1e', phase: 0 },
            { path: 'M 26 32 Q 28 20 30 14 Q 25 18 24 32 Z', fill: '#208520', phase: 0.15 },
            { path: 'M 12 32 Q 10 15 14 6 Q 18 16 20 32 Z', fill: '#2ea62e', phase: 0.3 },
            { path: 'M 18 32 Q 22 22 26 16 Q 16 22 14 32 Z', fill: '#39c439', phase: 0.45 },
            { path: 'M 8 32 Q 10 24 6 16 Q 12 24 14 32 Z', fill: '#1bcf1b', phase: 0.1 },
        ];

        for (const blade of blades) {
            // Per-blade phase offset gives a natural ripple/wave effect
            const bt = (t + blade.phase) % 1;

            // Gentler rustle: 0→12°, 25→-8°, 50→5°, 75→-3°, 100→0°
            let rustleAngle: number;
            if (bt < 0.2) {
                rustleAngle = lerp(0, 12, bt / 0.2);
            } else if (bt < 0.45) {
                rustleAngle = lerp(12, -8, (bt - 0.2) / 0.25);
            } else if (bt < 0.65) {
                rustleAngle = lerp(-8, 5, (bt - 0.45) / 0.2);
            } else if (bt < 0.85) {
                rustleAngle = lerp(5, -2, (bt - 0.65) / 0.2);
            } else {
                rustleAngle = lerp(-2, 0, (bt - 0.85) / 0.15);
            }

            ctx.save();
            ctx.translate(16, 32);
            ctx.rotate(rustleAngle * Math.PI / 180);
            ctx.translate(-16, -32);

            ctx.fillStyle = blade.fill;
            const path = new Path2D(blade.path);
            ctx.fill(path);
            ctx.restore();
        }

        frames.push(canvas);
    }
    return frames;
}

// ─── Public API ──────────────────────────────────────────────────────────

function ensureInitialized() {
    if (initialized) return;
    initialized = true;

    frameCache.set('lava', generateLavaFrames());
    frameCache.set('water', generateWaterBodyFrames());
    frameCache.set('water_surface', generateWaterSurfaceFrames());
    frameCache.set('crystal', generateCrystalFrames());
    frameCache.set('ground', generateGroundFrames());
    frameCache.set('grass', generateGrassFrames());
    frameCache.set('grass_rustle', generateGrassRustleFrames());
}

/**
 * Get the current animation frame for a tile type.
 * @param spriteId - 'lava' | 'water' | 'water_surface' | 'crystal' | 'grass' | 'grass_rustle'
 * @param time - current time in seconds (e.g. performance.now() / 1000)
 * @returns OffscreenCanvas to draw, or null if spriteId not cached
 */
function getFrame(spriteId: string, time: number): OffscreenCanvas | null {
    ensureInitialized();

    const frames = frameCache.get(spriteId);
    if (!frames) return null;

    const duration = spriteId === 'grass_rustle' ? 0.5 : ANIMATION_DURATION;
    const normalizedTime = (time % duration) / duration;
    const frameIndex = Math.floor(normalizedTime * frames.length) % frames.length;

    return frames[frameIndex];
}

/**
 * Draw an SVG tile onto a canvas context using cached bitmap frames.
 * Handles all transforms (rotation, scale, opacity, glow) just like drawTile.
 */
function drawSvgTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    spriteId: string,
    time: number,
    options?: {
        isSurface?: boolean;
        isRustling?: boolean;
        opacity?: number;
        rotation?: number;
        scaleX?: number;
        scaleY?: number;
        glowColor?: string;
        glow?: {
            style?: string;
            color?: string;
            intensity?: number;
            speed?: number;
            colors?: string[];
        };
    }
) {
    let cacheKey = spriteId;
    if (spriteId === 'water' && options?.isSurface) {
        cacheKey = 'water_surface';
    }
    if (spriteId === 'grass' && options?.isRustling) {
        cacheKey = 'grass_rustle';
    }

    const frame = getFrame(cacheKey, time);
    if (!frame) return;

    ctx.save();

    // Apply transforms
    const scaleX = options?.scaleX ?? 1;
    const scaleY = options?.scaleY ?? 1;
    const rotation = options?.rotation ?? 0;

    if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
        const cx = x + size / 2;
        const cy = y + size / 2;
        ctx.translate(cx, cy);
        if (rotation !== 0) ctx.rotate(rotation * Math.PI / 180);
        if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
        ctx.translate(-cx, -cy);
    }

    // Apply glow
    if (options?.glowColor || options?.glow) {
        let currentGlowColor = options.glowColor || options.glow?.color || '#ffffff';
        let intensity = options.glow?.intensity ?? 15;

        if (options.glow) {
            const speed = options.glow.speed || 1;
            if (options.glow.style === 'pulsing') {
                const pulse = (Math.sin(time * speed * Math.PI) + 1) / 2;
                intensity = intensity * (0.5 + 0.5 * pulse);
            } else if (options.glow.style === 'multi-color' && options.glow.colors && options.glow.colors.length > 0) {
                const t = (time * speed) % options.glow.colors.length;
                const idx1 = Math.floor(t);
                const idx2 = (idx1 + 1) % options.glow.colors.length;
                const blend = t - idx1;
                // Simple hex lerp
                const lerpHex = (a: string, b: string, t: number) => {
                    const ah = parseInt(a.replace('#', ''), 16);
                    const bh = parseInt(b.replace('#', ''), 16);
                    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
                    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
                    const rr = Math.round(ar + (br - ar) * t);
                    const rg = Math.round(ag + (bg - ag) * t);
                    const rb = Math.round(ab + (bb - ab) * t);
                    return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
                };
                currentGlowColor = lerpHex(options.glow.colors[idx1], options.glow.colors[idx2], blend);
            } else if (options.glow.style === 'random') {
                intensity = intensity * (0.5 + Math.random() * 0.5);
                if (options.glow.colors && options.glow.colors.length > 0) {
                    const tHash = Math.floor(time * speed * 10);
                    const idx = tHash % options.glow.colors.length;
                    currentGlowColor = options.glow.colors[idx];
                } else {
                    const timeHash = Math.floor(time * speed * 10);
                    const r = (timeHash * 13) % 255;
                    const g = (timeHash * 17) % 255;
                    const b = (timeHash * 23) % 255;
                    currentGlowColor = `rgb(${r},${g},${b})`;
                }
            }
        }

        ctx.shadowColor = currentGlowColor;
        ctx.shadowBlur = intensity;
    }

    // Apply opacity
    ctx.globalAlpha = options?.opacity ?? 1;

    // Draw the cached frame, scaling from 32x32 to target size
    ctx.drawImage(frame, x, y, size, size);

    ctx.restore();
}

export const TileSpriteCache = {
    getFrame,
    drawSvgTile,
    ensureInitialized,
};
