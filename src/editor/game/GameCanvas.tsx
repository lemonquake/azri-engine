
import { useRef, useEffect, useState } from 'react';
import { GameRunner } from './GameRunner';
import { GameOverScreen } from './GameOverScreen';
import { PlayerHUD } from './PlayerHUD';
import { GrassTile } from '../components/tiles/GrassTile';
import { WaterTile } from '../components/tiles/WaterTile';
import { LavaTile } from '../components/tiles/LavaTile';
import { CrystalTile } from '../components/tiles/CrystalTile';
import type { Tile, Layer } from '../types';

const SVG_TILES = ['grass', 'water', 'lava', 'crystal'];

export function GameCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const runnerRef = useRef<GameRunner | null>(null);
    const [stats, setStats] = useState({ hp: 100, maxHp: 100, exp: 0, maxExp: 100, level: 1, wallJumps: 3, maxWallJumps: 3, wallFriction: 0 });
    const [runnerReady, setRunnerReady] = useState(false);
    const [levelData, setLevelData] = useState<{ tiles: Tile[], layers: Layer[], gridSize: number }>({ tiles: [], layers: [], gridSize: 32 });

    // For Grass overlay & Viewport Culling
    const [rustlingTiles, setRustlingTiles] = useState<Set<string>>(new Set());
    const overlayRef = useRef<HTMLDivElement>(null);
    const cullRectRef = useRef({ x: -1000, y: -1000, w: 3000, h: 3000 });
    const [, setCullVersion] = useState(0);

    // Game Over State
    const [isGameOver, setIsGameOver] = useState(false);
    const [runKey, setRunKey] = useState(0); // Used to force restart 

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (canvas) {
            canvas.focus();
        }

        // Initialize Game Runner
        runnerRef.current = new GameRunner(canvas);

        // Subscribe to stats
        runnerRef.current.onStatsChange = (newStats) => {
            setStats(newStats);
        };

        runnerRef.current.onGameOver = () => {
            setIsGameOver(true);
        };

        runnerRef.current.onGrassRustle = (tileId) => {
            setRustlingTiles(prev => {
                if (prev.has(tileId)) return prev;
                const next = new Set(prev);
                next.add(tileId);
                return next;
            });
            setTimeout(() => {
                setRustlingTiles(prev => {
                    const next = new Set(prev);
                    next.delete(tileId);
                    return next;
                });
            }, 500);
        };

        runnerRef.current.start();
        setLevelData({
            tiles: runnerRef.current.getTiles(),
            layers: runnerRef.current.getLayers(),
            gridSize: runnerRef.current.getGridSize(),
        });
        setRunnerReady(true);

        return () => {
            runnerRef.current?.stop();
            runnerRef.current = null;
        };
    }, [runKey]); // Will re-run setup and teardown when runKey changes

    // Animation frame to update overlay position
    useEffect(() => {
        if (!runnerReady) return;
        let frameId: number;
        const updateOverlay = () => {
            if (runnerRef.current && overlayRef.current) {
                const cam = runnerRef.current.getCamera();
                overlayRef.current.style.transform = `translate(${-Math.floor(cam.x)}px, ${-Math.floor(cam.y)}px)`;

                const cr = cullRectRef.current;
                const sw = window.innerWidth;
                const sh = window.innerHeight;

                // Threshold: recenter if camera is outside the central 1/3 viewport of our cull rect
                if (
                    cam.x < cr.x + sw * 0.5 ||
                    cam.y < cr.y + sh * 0.5 ||
                    cam.x + sw > cr.x + cr.w - sw * 0.5 ||
                    cam.y + sh > cr.y + cr.h - sh * 0.5
                ) {
                    cullRectRef.current = {
                        x: cam.x - sw,
                        y: cam.y - sh,
                        w: sw * 3,
                        h: sh * 3
                    };
                    setCullVersion(v => v + 1);
                }
            }
            frameId = requestAnimationFrame(updateOverlay);
        };
        updateOverlay();
        return () => cancelAnimationFrame(frameId);
    }, [runnerReady]);

    return (
        <div className="relative w-full h-full overflow-hidden">
            <canvas
                ref={canvasRef}
                className="w-full h-full block touch-none focus:outline-none bg-[#1e1e2e]"
                tabIndex={0}
                onContextMenu={(e) => e.preventDefault()}
            />
            {/* --- DOM Overlay for SVG Tiles --- */}
            {runnerReady && (
                <div ref={overlayRef} className="absolute inset-0 pointer-events-none origin-top-left">
                    {levelData.layers.filter(l => l.visible).map(layer => {
                        const cr = cullRectRef.current;
                        const layerTiles = levelData.tiles.filter(t => {
                            if (t.layerId !== layer.id || !SVG_TILES.includes(t.spriteId)) return false;
                            const tx = t.gridX * levelData.gridSize;
                            const ty = t.gridY * levelData.gridSize;
                            return (
                                tx + levelData.gridSize >= cr.x &&
                                tx <= cr.x + cr.w &&
                                ty + levelData.gridSize >= cr.y &&
                                ty <= cr.y + cr.h
                            );
                        });
                        return layerTiles.map(tile => {
                            const x = tile.gridX * levelData.gridSize;
                            const y = tile.gridY * levelData.gridSize;
                            const tileProps = { key: tile.id, x, y, size: levelData.gridSize, opacity: tile.opacity, rotation: tile.rotation, scaleX: tile.scaleX, scaleY: tile.scaleY, glowColor: tile.glowColor, glow: tile.glow };

                            if (tile.spriteId === 'grass') return <GrassTile {...tileProps} isReacting={rustlingTiles.has(tile.id)} />;
                            if (tile.spriteId === 'lava') return <LavaTile {...tileProps} />;
                            if (tile.spriteId === 'crystal') return <CrystalTile {...tileProps} />;
                            if (tile.spriteId === 'water') {
                                const isSurface = !levelData.tiles.some(t => t.layerId === layer.id && t.spriteId === 'water' && t.gridX === tile.gridX && t.gridY === tile.gridY - 1);
                                return <WaterTile {...tileProps} isSurface={isSurface} />;
                            }
                            return null;
                        });
                    })}
                </div>
            )}

            {/* --- Game Over Overlay --- */}
            {isGameOver && (
                <GameOverScreen
                    onContinue={() => {
                        setIsGameOver(false);
                        setRunKey(k => k + 1); // Triggers re-initialization
                    }}
                    onQuit={() => {
                        import('../../editor/state/editorStore').then(module => {
                            module.useEditorStore.getState().togglePlayMode();
                        });
                    }}
                />
            )}

            <PlayerHUD {...stats} />
        </div>
    );
}
