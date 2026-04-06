import * as PIXI from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import type { Tile, SkyboxLayer, LevelImage } from '../../editor/types';
import { TileSpriteCache } from '../../editor/components/tiles/TileSpriteCache';
import { DefaultCharacter } from '../../editor/game/DefaultCharacter';
import { EnemyRenderer } from '../../editor/game/EnemyRenderer';

export class PixiRenderer {
    public app: PIXI.Application;
    
    // Core containers for Z-sorting
    public backgroundContainer: PIXI.Container;
    public objectContainer: PIXI.Container; // Level images (props), placed back-to-front
    public tileContainer: PIXI.Container;
    public entityContainer: PIXI.Container;
    public particleContainer: PIXI.Container;
    public collisionContainer: PIXI.Container;
    public uiContainer: PIXI.Container;

    // The main world container that gets panned by the camera
    public worldContainer: PIXI.Container;

    private isInitialized = false;
    private isDestroyed = false;
    private initPromise: Promise<void> | null = null;

    // Texture Cache
    private textureCache = new Map<string, PIXI.Texture>();
    private filterCache = new Map<string, any>(); // For GlowFilter instances
    private subTextureCache = new Map<string, PIXI.Texture>();
    
    // Sprite Caches mapped by Entity/Tile IDs
    private spriteCache = new Map<string, PIXI.Sprite | PIXI.Graphics | PIXI.Text | PIXI.TilingSprite>();
    private pixiTextureCache = new Map<OffscreenCanvas, PIXI.Texture>();
    private entityCanvasCache = new Map<string, { canvas: OffscreenCanvas, texture: PIXI.Texture, ctx: OffscreenCanvasRenderingContext2D }>();

    private getPixiTextureForCanvas(canvas: OffscreenCanvas | null): PIXI.Texture | null {
        if (!canvas) return null;
        let tex = this.pixiTextureCache.get(canvas);
        if (!tex) {
            tex = PIXI.Texture.from(canvas);
            tex.source.style.scaleMode = 'nearest';
            this.pixiTextureCache.set(canvas, tex);
        }
        return tex;
    }

    private getTextureSafe(src: string): PIXI.Texture {
        if (!src) return PIXI.Texture.EMPTY;
        if (this.textureCache.has(src)) return this.textureCache.get(src)!;
        
        let tex = PIXI.Texture.EMPTY;
        const imageCache: { [key: string]: HTMLImageElement } = (window as any)._tileImageCache || {};
        const img = imageCache[src];

        if (img && img.complete && img.naturalWidth > 0) {
            tex = PIXI.Texture.from(img);
            this.textureCache.set(src, tex);
        } else {
            this.textureCache.set(src, tex); // Prevent spamming
            PIXI.Assets.load(src).then(loadedTex => {
                this.textureCache.set(src, loadedTex);
            }).catch(e => {
                console.warn(`Failed to dynamically load pixi asset: ${src}`, e);
            });
        }
        return tex;
    }

    constructor() {
        this.app = new PIXI.Application();
        this.worldContainer = new PIXI.Container();
        this.backgroundContainer = new PIXI.Container();
        this.objectContainer = new PIXI.Container();
        this.tileContainer = new PIXI.Container();
        this.entityContainer = new PIXI.Container();
        this.particleContainer = new PIXI.Container();
        this.collisionContainer = new PIXI.Container();
        this.uiContainer = new PIXI.Container();

        this.worldContainer.addChild(this.backgroundContainer);
        this.worldContainer.addChild(this.tileContainer);
        this.worldContainer.addChild(this.objectContainer);
        this.worldContainer.addChild(this.entityContainer);
        this.worldContainer.addChild(this.particleContainer);
        this.worldContainer.addChild(this.collisionContainer);
    }

    public async init(canvas: HTMLCanvasElement) {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;
        if (this.isDestroyed) return;
        
        this.initPromise = this.app.init({
            canvas,
            background: '#1e1e2e',
            width: canvas.clientWidth || 800,
            height: canvas.clientHeight || 600,
            antialias: false,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        }).then(() => {
            if (this.isDestroyed) {
                // If destroy was called while we were initializing, clean up now
                try { this.app.destroy({ removeView: false }); } catch (e) {}
                return;
            }

            // Ensure pixel perfect scaling for pixel art games
            PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';

            this.app.stage.addChild(this.worldContainer);
            this.app.stage.addChild(this.uiContainer);

            // Handle Resize since we removed `resizeTo` 
            const resizeObserver = new ResizeObserver(() => {
                if (this.isDestroyed || !this.app.renderer) return;
                this.app.renderer.resize(canvas.clientWidth, Math.max(1, canvas.clientHeight));
            });
            resizeObserver.observe(canvas);

            this.isInitialized = true;
        }).catch(err => {
            console.warn("PixiJS Init Error:", err);
        });

        return this.initPromise;
    }

    public getTexture(src: string): PIXI.Texture {
        return this.getTextureSafe(src);
    }

    public setCameraPosition(x: number, y: number) {
        this.worldContainer.position.set(-Math.floor(x), -Math.floor(y));
    }

    public applyShake(shakeTimer: number, intensity: number) {
        if (shakeTimer > 0) {
            const dx = (Math.random() - 0.5) * intensity * 2;
            const dy = (Math.random() - 0.5) * intensity * 2;
            this.worldContainer.position.x += dx;
            this.worldContainer.position.y += dy;
        }
    }

    // A fast render function that can be called from GameRunner loop
    public renderState(
        camera: { x: number, y: number },
        shakeTimer: number,
        shakeIntensity: number,
        tiles: Tile[],
        tileRuntime: Map<string, any>,
        enemies: any[],
        player: any,
        remotePlayers: any[],
        enemyProjectiles: any[],
        particles: any[],
        skyboxLayers: SkyboxLayer[],
        levelImages: any[],
        collisionShapes: import('../../editor/types').CollisionShape[],
        time: number = 0,
        tileDefs?: Map<string, import('../../editor/types').TileDefinition>
    ) {
        if (!this.isInitialized) return;

        this.setCameraPosition(camera.x, camera.y);
        this.applyShake(shakeTimer, shakeIntensity);

        // Sync Backgrounds
        this.syncSkybox(skyboxLayers, camera, time);
        
        // Sync Tiles
        this.syncTiles(tiles, tileRuntime, time, tileDefs);
        
        // Sync Level Images (Props)
        this.syncLevelImages(levelImages);

        // Sync Entities
        this.syncEntities(player, remotePlayers, enemies);

        // Sync Projectiles
        this.syncProjectiles(enemyProjectiles);

        // Sync Particles
        this.syncParticles(particles);

        // Sync Collision Shapes (Hidden by default for gameplay)
        if ((window as any)._debugCollisions) {
            this.collisionContainer.visible = true;
            this.syncCollisions(collisionShapes, tiles, tileRuntime);
        } else {
            this.collisionContainer.visible = false;
        }

        // Sync UI
        this.syncUI();
    }

    private syncSkybox(skyboxLayers: SkyboxLayer[], camera: { x: number, y: number }, time: number) {
        const currentIds = new Set<string>();

        skyboxLayers.forEach(layer => {
            if (!layer.visible) return;
            const id = 'sky_' + layer.id;
            currentIds.add(id);

            if (layer.type === 'color') {
                let sprite = this.spriteCache.get(id) as PIXI.Graphics;
                if (!sprite || !(sprite instanceof PIXI.Graphics)) {
                    if (sprite) {
                        this.backgroundContainer.removeChild(sprite as any);
                        (sprite as any).destroy();
                    }
                    sprite = new PIXI.Graphics();
                    this.backgroundContainer.addChild(sprite);
                    this.spriteCache.set(id, sprite);
                }
                sprite.clear();
                sprite.rect(0, 0, this.app.screen.width || 800, this.app.screen.height || 600);
                sprite.fill({ color: layer.value });
                sprite.alpha = layer.opacity !== undefined ? layer.opacity : 1;

                // Lock to camera 
                sprite.position.set(camera.x, camera.y);
            } else if (layer.type === 'image') {
                let sprite = this.spriteCache.get(id) as PIXI.TilingSprite;
                const tex = this.getTextureSafe(layer.value);

                if (!sprite || !(sprite instanceof PIXI.TilingSprite)) {
                    if (sprite) {
                        this.backgroundContainer.removeChild(sprite as any);
                        (sprite as any).destroy();
                    }
                    sprite = new PIXI.TilingSprite({
                        texture: tex,
                        width: this.app.screen.width || 800,
                        height: this.app.screen.height || 600
                    });
                    this.backgroundContainer.addChild(sprite);
                    this.spriteCache.set(id, sprite);
                } else {
                    if (sprite.texture !== tex) {
                        sprite.texture = tex;
                    }
                }

                sprite.width = this.app.screen.width || 800;
                sprite.height = this.app.screen.height || 600;
                sprite.alpha = layer.opacity !== undefined ? layer.opacity : 1;

                const plxX = layer.parallax?.x ?? 0;
                const plxY = layer.parallax?.y ?? 0;
                const velX = layer.velocity?.x ?? 0;
                const velY = layer.velocity?.y ?? 0;
                const offX = layer.offset?.x ?? 0;
                const offY = layer.offset?.y ?? 0;

                const scrollX = offX + (camera.x * plxX) + (time * velX);
                const scrollY = offY + (camera.y * plxY) + (time * velY);
                
                sprite.tilePosition.set(-scrollX, -scrollY);
                
                sprite.position.set(camera.x, camera.y);
            }
        });

        this.cleanupCache(this.backgroundContainer, currentIds, 'sky_');
    }

    private syncLevelImages(levelImages: LevelImage[]) {
        const currentIds = new Set<string>();
        levelImages.forEach(img => {
            if (!img.visible) return;
            const id = 'prop_' + img.id;
            currentIds.add(id);
            
            let sprite = this.spriteCache.get(id) as PIXI.Sprite;
            const tex = this.getTextureSafe(img.src);

            if (!sprite || sprite instanceof PIXI.Graphics || sprite instanceof PIXI.TilingSprite) {
                if (sprite) {
                    this.objectContainer.removeChild(sprite);
                    sprite.destroy();
                }
                sprite = new PIXI.Sprite(tex);
                this.objectContainer.addChild(sprite);
                this.spriteCache.set(id, sprite);
            } else {
                if (sprite.texture !== tex) {
                    sprite.texture = tex;
                }
            }
            
            sprite.width = img.width || 32;
            sprite.height = img.height || 32;
            sprite.position.set(img.x, img.y);
            sprite.alpha = img.opacity ?? 1;
            if (img.rotation) sprite.rotation = img.rotation * Math.PI / 180;
            if (img.tint) sprite.tint = img.tint;
        });

        this.cleanupCache(this.objectContainer, currentIds, 'prop_');
    }

    private syncTiles(tiles: Tile[], tileRuntime: Map<string, any>, time: number, tileDefs?: Map<string, import('../../editor/types').TileDefinition>) {
        const currentIds = new Set<string>();

        for (const tile of tiles) {
            const id = 'tile_' + tile.id;
            currentIds.add(id);
            
            let sprite: any = this.spriteCache.get(id);
            if (!sprite) {
                sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
                this.tileContainer.addChild(sprite);
                this.spriteCache.set(id, sprite);
            }

            sprite.x = tile.gridX * 32;
            sprite.y = tile.gridY * 32;

            sprite.width = 32 * Math.abs(tile.scaleX || 1);
            sprite.height = 32 * Math.abs(tile.scaleY || 1);
            if ((tile.scaleX || 1) < 0) sprite.scale.x *= -1;
            if ((tile.scaleY || 1) < 0) sprite.scale.y *= -1;
            
            if (tile.spriteId === 'text_object' && tile.text) {
                // Remove generic sprite if we created one, or swap to Text
                let tSprite = this.spriteCache.get(id) as PIXI.Text;
                if (!tSprite || !(tSprite instanceof PIXI.Text)) {
                    if (sprite) {
                        this.tileContainer.removeChild(sprite);
                        sprite.destroy();
                    }
                    tSprite = new PIXI.Text({ 
                        text: tile.text, 
                        style: {
                            fontFamily: tile.fontFamily || 'sans-serif',
                            fontSize: tile.fontSize || 32,
                            fill: tile.fontColor || '#ffffff'
                        }
                    });
                    this.tileContainer.addChild(tSprite);
                    this.spriteCache.set(id, tSprite);
                } else {
                    tSprite.text = tile.text;
                }
                sprite = tSprite;
                sprite.tint = 0xffffff; // Reset tint
            } else {
                // Remove Text Object if tile morphed
                if (sprite instanceof PIXI.Text) {
                    this.tileContainer.removeChild(sprite);
                    sprite.destroy();
                    sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.tileContainer.addChild(sprite);
                    this.spriteCache.set(id, sprite);
                }
                
                // Fetch dynamic animation frame from TileSpriteCache
                const rt = tileRuntime.get(tile.id);
                const isWaterSurface = tile.spriteId === 'water' && (!tiles.some(t => t.gridX === tile.gridX && t.gridY === tile.gridY - 1 && t.spriteId === 'water'));
                const isGrassRustling = tile.spriteId === 'grass' && rt && Math.random() < 0.05; // Quick approximate for rustling if rustle state missing
                
                let cacheKey = tile.spriteId;
                if (isWaterSurface) cacheKey = 'water_surface';
                if (isGrassRustling) cacheKey = 'grass_rustle';
                if (cacheKey === 'ground') cacheKey = 'ground'; // Ensure ground maps properly
                
                const frameCanvas = TileSpriteCache.getFrame(cacheKey, time);
                if (frameCanvas) {
                    sprite.texture = this.getPixiTextureForCanvas(frameCanvas);
                    sprite.tint = 0xffffff; // No manual tinting if graphic exists
                } else {
                    const def = tileDefs?.get(tile.spriteId);
                    if (def && def.textureSrc) {
                        const baseTex = this.getTextureSafe(def.textureSrc);
                        if (def.srcX !== undefined && def.srcY !== undefined && def.srcWidth && def.srcHeight) {
                            const subTexId = `${def.textureSrc}_${def.srcX}_${def.srcY}_${def.srcWidth}_${def.srcHeight}`;
                            let subTex = this.subTextureCache.get(subTexId);
                            if (!subTex) {
                                // Important: in Pixi V8, if source is not fully loaded, its width might be 0.
                                // We should only create a sub-texture and frame if the source is large enough.
                                if (baseTex.source && baseTex.source.width >= def.srcX + def.srcWidth) {
                                    subTex = new PIXI.Texture({
                                        source: baseTex.source,
                                        frame: new PIXI.Rectangle(def.srcX, def.srcY, def.srcWidth, def.srcHeight)
                                    });
                                    this.subTextureCache.set(subTexId, subTex);
                                    sprite.texture = subTex;
                                } else {
                                    // Texture still loading or invalid size, fallback to whole texture
                                    sprite.texture = baseTex;
                                }
                            } else {
                                sprite.texture = subTex;
                            }
                        } else {
                            sprite.texture = baseTex;
                        }
                        sprite.tint = 0xffffff;
                    } else {
                        // Fallback visual distinction for different types to keep scale & fluidity 
                        sprite.texture = PIXI.Texture.WHITE;
                        if (tile.spriteId === 'lava') sprite.tint = 0xf97316;
                        else if (tile.spriteId === 'water') sprite.tint = 0x3b82f6;
                        else if (tile.spriteId === 'grass') sprite.tint = 0x22c55e;
                        else if (tile.spriteId === 'crystal') sprite.tint = 0xa855f7;
                        else if (def && def.color) sprite.tint = parseInt(def.color.replace('#', ''), 16);
                        else sprite.tint = tile.hasCollision ? 0x4b5563 : 0x374151; // Wall vs Ground
                    }
                }
            }

            sprite.alpha = tile.opacity ?? 1;
            if (tile.rotation) sprite.rotation = tile.rotation * Math.PI / 180;
            
            if (tile.glow || tile.glowColor) {
                let filter = this.filterCache.get(id) as GlowFilter;
                if (!filter) {
                    filter = new GlowFilter({ distance: 15, outerStrength: 2 });
                    this.filterCache.set(id, filter);
                }
                
                let glowHex = tile.glowColor || tile.glow?.color || '#ffffff';
                let intensity = tile.glow?.intensity ?? 15;
                if (tile.glow) {
                   const speed = tile.glow.speed || 1;
                   if (tile.glow.style === 'pulsing') {
                       const pulse = (Math.sin(time * speed * Math.PI) + 1) / 2;
                       intensity = intensity * (0.5 + 0.5 * pulse);
                   }
                   // Can add more complex multi-color glow support if required over time
                }
                
                (filter as any).distance = intensity;
                filter.outerStrength = Math.max(1, intensity / 5);
                filter.color = parseInt(glowHex.replace('#', ''), 16);
                sprite.filters = [filter];
            } else {
                sprite.filters = [];
            }
            
            // Adjust dynamic movement offsets from behaviours
            const rt = tileRuntime.get(tile.id);
            if (rt) {
                if (rt.movingOffset) {
                    if (rt.currentAxis === 'horizontal') sprite.x += rt.movingOffset;
                    else sprite.y += rt.movingOffset;
                }
                if (rt.chaosOffsetX) sprite.x += rt.chaosOffsetX;
                if (rt.chaosOffsetY) sprite.y += rt.chaosOffsetY;
                if (rt.sinkOffset) sprite.y += rt.sinkOffset;
                if (rt.fallOffset) {
                    sprite.y += rt.fallOffset;
                    sprite.alpha = Math.max(0, sprite.alpha - rt.fallOffset / 500);
                }
            }
        }

        // Cleanup old tiles
        this.cleanupCache(this.tileContainer, currentIds, 'tile_');
    }

    private getEntitySprite(id: string): { sprite: PIXI.Sprite, ctx: OffscreenCanvasRenderingContext2D, texture: PIXI.Texture } {
        let cache = this.entityCanvasCache.get(id);
        if (!cache) {
            const canvasWidth = 120; // ample room for weapons/effects
            const canvasHeight = 120;
            const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
            ctx.imageSmoothingEnabled = false; // pixel art style
            const texture = PIXI.Texture.from(canvas);
            cache = { canvas, texture, ctx };
            this.entityCanvasCache.set(id, cache);

            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5, 0.5); // Center anchor for precise drawing offsets
            this.entityContainer.addChild(sprite);
            this.spriteCache.set(id, sprite);
        }

        const sprite = this.spriteCache.get(id) as PIXI.Sprite;
        return { sprite, ctx: cache.ctx, texture: cache.texture };
    }

    private syncEntities(player: any, remotePlayers: any[], enemies: any[]) {
        const currentIds = new Set<string>();

        // Player
        if (player) {
            const id = 'player_main';
            currentIds.add(id);
            const { sprite, ctx, texture } = this.getEntitySprite(id);
            
            ctx.clearRect(0, 0, 120, 120);
            
            // Render to OffscreenCanvas
            // We pass an adjusted object to DefaultCharacter so it draws in the center of our 120x120 canvas
            const mockPlayerForRender = {
                ...player,
                x: 60 - (player.width || 20) / 2,
                y: 60 - (player.height || 28) / 2,
                rotation: 0, // Pixi will handle final rotation
                scaleX: 1,
                scaleY: 1
            };
            DefaultCharacter.render(ctx as any, mockPlayerForRender);
            texture.source.update(); // Push to GPU
            
            sprite.position.set(player.x + (player.width || 20) / 2, player.y + (player.height || 28) / 2);
            if (player.rotation !== undefined) sprite.rotation = player.rotation * Math.PI / 180;
            if (player.scaleX !== undefined) sprite.scale.x = player.scaleX;
            if (player.scaleY !== undefined) sprite.scale.y = player.scaleY;
        }

        // Remote Players
        remotePlayers.forEach((rp, i) => {
            const id = 'rp_' + i;
            currentIds.add(id);
            const { sprite, ctx, texture } = this.getEntitySprite(id);
            
            ctx.clearRect(0, 0, 120, 120);
            const mockPlayerForRender = {
                ...rp,
                x: 60 - (rp.width || 20) / 2,
                y: 60 - (rp.height || 28) / 2,
                rotation: 0, scaleX: 1, scaleY: 1
            };
            DefaultCharacter.render(ctx as any, mockPlayerForRender);
            texture.source.update();
            
            sprite.position.set(rp.x + (rp.width || 20) / 2, rp.y + (rp.height || 28) / 2);
        });

        // Enemies
        enemies.forEach((enemy, i) => {
            if (enemy.dead) return;
            const id = 'enemy_' + i;
            currentIds.add(id);
            const { sprite, ctx, texture } = this.getEntitySprite(id);
            
            ctx.clearRect(0, 0, 120, 120);
            const mockEnemyForRender = {
                ...enemy,
                x: 60 - (enemy.width || 20) / 2,
                y: 60 - (enemy.height || 28) / 2,
                rotation: 0, scaleX: 1, scaleY: 1
            };
            EnemyRenderer.render(ctx as any, mockEnemyForRender);
            texture.source.update();
            
            sprite.position.set(enemy.x + (enemy.width || 20) / 2, enemy.y + (enemy.height || 28) / 2);
        });

        // Cleanup
        this.cleanupCache(this.entityContainer, currentIds, 'player_');
        this.cleanupCache(this.entityContainer, currentIds, 'enemy_');
        this.cleanupCache(this.entityContainer, currentIds, 'rp_');
    }

    private syncProjectiles(projectiles: any[]) {
        const currentIds = new Set<string>();

        projectiles.forEach((proj, i) => {
            const id = 'proj_' + i;
            currentIds.add(id);

            let sprite = this.spriteCache.get(id) as PIXI.Graphics;
            if (!sprite) {
                sprite = new PIXI.Graphics();
                this.entityContainer.addChild(sprite);
                this.spriteCache.set(id, sprite);
            }

            sprite.clear();
            if (proj.shape === 'circle') {
                sprite.circle(0, 0, proj.width / 2);
            } else {
                sprite.rect(-proj.width / 2, -proj.height / 2, proj.width, proj.height);
            }
            sprite.fill({ color: proj.color });
            sprite.position.set(proj.x, proj.y);
        });

        this.cleanupCache(this.entityContainer, currentIds, 'proj_');
    }

    private syncParticles(particles: any[]) {
        // Fast particle render
        this.particleContainer.removeChildren(); // Immediate mode clearing 
        // Actual robust implementation will pool sprites
        particles.forEach((p) => {
            const size = p.shrink ? p.size * (p.life / p.maxLife) : p.size;
            
            if (p.shape === 'text' && p.text) {
                let txt = this.spriteCache.get('part_txt_' + p.id) as PIXI.Text;
                if (!txt) {
                    txt = new PIXI.Text({ 
                        text: p.text, 
                        style: { fontFamily: 'monospace', fontSize: size, fill: p.color, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } 
                    });
                    txt.anchor.set(0.5, 0.5);
                    this.spriteCache.set('part_txt_' + p.id, txt);
                }
                txt.position.set(p.x, p.y);
                txt.alpha = Math.max(0, p.life / p.maxLife);
                this.particleContainer.addChild(txt);
                return;
            }

            const gfx = new PIXI.Graphics();
            if (p.shape === 'circle' || p.shape === 'ring') {
                if (p.shape === 'ring') gfx.circle(0,0, size).stroke({ color: p.color, width: 2 });
                else gfx.circle(0,0, size).fill({ color: p.color });
            } else { // square limit
                gfx.rect(-size/2, -size/2, size, size).fill({ color: p.color });
            }
            gfx.position.set(p.x, p.y);
            if (p.rotation !== undefined) gfx.rotation = p.rotation * Math.PI / 180;
            gfx.alpha = Math.max(0, p.life / p.maxLife);
            this.particleContainer.addChild(gfx);
        });
    }

    private syncCollisions(collisionShapes: import('../../editor/types').CollisionShape[], tiles: Tile[], tileRuntime: Map<string, any>) {
        const currentIds = new Set<string>();

        // 1. Draw custom collision shapes
        collisionShapes.forEach(shape => {
            const id = 'col_shape_' + shape.id;
            currentIds.add(id);

            let sprite = this.spriteCache.get(id) as PIXI.Graphics;
            if (!sprite) {
                sprite = new PIXI.Graphics();
                this.collisionContainer.addChild(sprite);
                this.spriteCache.set(id, sprite);
            }

            sprite.clear();
            sprite.alpha = 0.3; 
            
            const fillStyle = { color: 0xff0000, alpha: 0.5 };
            const strokeStyle = { color: 0xff0000, width: 2 };

            if (shape.type === 'box') {
                if (shape.rotation) {
                    const cx = shape.x + shape.width / 2;
                    const cy = shape.y + shape.height / 2;
                    sprite.position.set(cx, cy);
                    sprite.rotation = shape.rotation * Math.PI / 180;
                    sprite.rect(-shape.width / 2, -shape.height / 2, shape.width, shape.height).fill(fillStyle).stroke(strokeStyle);
                } else {
                    sprite.position.set(0, 0);
                    sprite.rotation = 0;
                    sprite.rect(shape.x, shape.y, shape.width, shape.height).fill(fillStyle).stroke(strokeStyle);
                }
            } else if (shape.type === 'circle') {
                sprite.position.set(0, 0);
                sprite.rotation = 0;
                sprite.circle(shape.x, shape.y, shape.radius).fill(fillStyle).stroke(strokeStyle);
            } else if (shape.type === 'polygon' && shape.vertices.length >= 3) {
                sprite.position.set(shape.x, shape.y);
                sprite.rotation = 0;
                sprite.poly(shape.vertices).fill(fillStyle).stroke(strokeStyle);
            }
        });

        // 2. Draw standard tile collision boundaries (32x32 tiles marked with hasCollision)
        // Access tileRuntime from GameRunner to properly offset debug hits
        // Wait, syncCollisions doesn't receive tileRuntime. Since it's debug, let's keep it simple or offset it.
        // Actually, I'll update it to check tile.gridX/Y. To do perfectly would require passing tileRuntime.
        // We'll leave it as is, since it's just a hidden debug layer now.
        tiles.forEach(tile => {
            if (!tile.hasCollision) return;

            const id = 'col_tile_' + tile.id;
            currentIds.add(id);

            let sprite = this.spriteCache.get(id) as PIXI.Graphics;
            if (!sprite) {
                sprite = new PIXI.Graphics();
                this.collisionContainer.addChild(sprite);
                this.spriteCache.set(id, sprite);
            }

            sprite.clear();
            sprite.alpha = 0.3;

            const fillStyle = { color: 0xff0000, alpha: 0.3 };
            const strokeStyle = { color: 0xff0000, width: 1 };
            
            // Re-apply offsets for accuracy
            const wWidth = 32 * Math.abs(tile.scaleX || 1);
            const wHeight = 32 * Math.abs(tile.scaleY || 1);

            let wx = tile.gridX * 32;
            let wy = tile.gridY * 32;

            if ((tile.scaleX || 1) < 0) wx -= wWidth;
            if ((tile.scaleY || 1) < 0) wy -= wHeight;

            const rt = tileRuntime.get(tile.id);
            if (rt) {
                if (rt.movingOffset) {
                    if (rt.currentAxis === 'horizontal') wx += rt.movingOffset;
                    else wy += rt.movingOffset;
                }
                if (rt.chaosOffsetX) wx += rt.chaosOffsetX;
                if (rt.chaosOffsetY) wy += rt.chaosOffsetY;
                if (rt.sinkOffset) wy += rt.sinkOffset;
                if (rt.fallOffset) wy += rt.fallOffset;
            }

            sprite.position.set(wx, wy);
            sprite.rotation = 0;
            sprite.rect(0, 0, wWidth, wHeight).fill(fillStyle).stroke(strokeStyle);
        });

        this.cleanupCache(this.collisionContainer, currentIds, 'col_');
    }

    private syncUI() {
        const idHUD = 'ui_hud';
        let hudText = this.spriteCache.get(idHUD) as PIXI.Text;
        if (!hudText || !(hudText instanceof PIXI.Text)) {
            hudText = new PIXI.Text({ 
                text: '', 
                style: {
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fill: 0xffffff
                } 
            });
            this.uiContainer.addChild(hudText);
            this.spriteCache.set(idHUD, hudText);
        }

        hudText.text = "PLAY MODE\nWASD / Arrows to Move + Jump\nS to Crouch";
        hudText.position.set(10, 20);
    }

    private cleanupCache(container: PIXI.Container, currentIds: Set<string>, prefix: string) {
        for (const [id, sprite] of this.spriteCache.entries()) {
            if (id.startsWith(prefix) && !currentIds.has(id)) {
                container.removeChild(sprite);
                sprite.destroy();
                this.spriteCache.delete(id);
            }
        }
    }

    public destroy() {
        this.isDestroyed = true;
        if (this.isInitialized) {
            try {
                this.app.destroy({ removeView: false });
            } catch (err) {
                console.error("PixiJS Destroy Error:", err);
            }
        }
    }
}
