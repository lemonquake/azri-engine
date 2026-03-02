/**
 * AnimationPreview - Live animation playback preview
 */
import { useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Maximize2, Check, X } from 'lucide-react';
import { useCharacterMasterStore } from '../characterMasterStore';
import { Tooltip, ScaleTooltipContent } from './Tooltip';

interface AnimationPreviewProps {
    className?: string;
}

export function AnimationPreview({ className }: AnimationPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const loadedImage = useCharacterMasterStore(s => s.loadedImage);
    const frames = useCharacterMasterStore(s => s.frames);
    const transform = useCharacterMasterStore(s => s.transform);
    const currentFrameIndex = useCharacterMasterStore(s => s.playback.currentFrameIndex);

    const isPlaying = useCharacterMasterStore(s => s.playback.isPlaying);

    const activeAnimationId = useCharacterMasterStore(s => s.activeAnimationId);
    const animations = useCharacterMasterStore(s => s.animations);
    const animation = activeAnimationId ? animations.get(activeAnimationId) : null;

    const activeSpriteSheetId = useCharacterMasterStore(s => s.activeSpriteSheetId);
    const spriteSheets = useCharacterMasterStore(s => s.spriteSheets);
    const sheet = activeSpriteSheetId ? spriteSheets.get(activeSpriteSheetId) : null;

    // Draw current frame
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !animation || !loadedImage || !sheet) return;

        // Clear with transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw checkerboard background
        const checkerSize = 8;
        for (let y = 0; y < canvas.height; y += checkerSize) {
            for (let x = 0; x < canvas.width; x += checkerSize) {
                const isEven = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
                ctx.fillStyle = isEven ? '#3f3f46' : '#27272a';
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }

        if (animation.frames.length === 0) return;

        const currentAnimFrame = animation.frames[currentFrameIndex];
        if (!currentAnimFrame) return;

        const frameData = frames.get(currentAnimFrame.frameId);
        if (!frameData) return;

        ctx.save();

        // Apply transform
        ctx.translate(canvas.width / 2 + transform.offsetX, canvas.height / 2 + transform.offsetY);
        ctx.scale(
            transform.scale * (transform.flipX ? -1 : 1),
            transform.scale * (transform.flipY ? -1 : 1)
        );
        ctx.translate(-frameData.width / 2, -frameData.height / 2);

        // Enable pixel-perfect rendering
        ctx.imageSmoothingEnabled = false;

        // Draw the frame
        ctx.drawImage(
            loadedImage,
            frameData.x, frameData.y, frameData.width, frameData.height,
            0, 0, frameData.width, frameData.height
        );

        ctx.restore();
    }, [animation, loadedImage, sheet, frames, currentFrameIndex, transform]);

    // Redraw when state changes
    useEffect(() => {
        draw();
    }, [draw]);

    // Resize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resizeObserver = new ResizeObserver(() => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
                draw();
            }
        });

        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        return () => resizeObserver.disconnect();
    }, [draw]);

    const currentFrame = animation?.frames[currentFrameIndex];
    const frameData = currentFrame ? frames.get(currentFrame.frameId) : null;

    return (
        <div className={clsx("flex flex-col", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Preview</span>
                </div>

                {animation && animation.frames.length > 0 && (
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>
                            Frame <strong className="text-zinc-300">{currentFrameIndex + 1}</strong>
                            <span className="mx-1">/</span>
                            <span>{animation.frames.length}</span>
                        </span>
                        {frameData && (
                            <span className="text-zinc-600">
                                {frameData.width}×{frameData.height}px
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ imageRendering: 'pixelated' }}
                />

                {/* Empty state */}
                {(!animation || animation.frames.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-zinc-500">
                            <Maximize2 size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No frames to preview</p>
                            <p className="text-xs mt-1">Add frames to an animation to see them here</p>
                        </div>
                    </div>
                )}

                {/* Playback indicator */}
                {isPlaying && (
                    <div className="absolute top-2 right-2 px-2 py-1 bg-emerald-500/20 border border-emerald-500/50 rounded text-xs text-emerald-400">
                        ▶ Playing
                    </div>
                )}
            </div>

            {/* Animation properties */}
            {animation && (
                <div className="flex items-center gap-3 px-3 py-2 border-t border-zinc-700/50 bg-zinc-800/30">
                    <Tooltip content="Loop: When enabled, animation repeats continuously">
                        <button
                            className={clsx(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                                animation.loop
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-zinc-700/50 text-zinc-400 border border-zinc-600"
                            )}
                        >
                            {animation.loop ? <Check size={12} /> : <X size={12} />}
                            Loop
                        </button>
                    </Tooltip>

                    <Tooltip content="Ping-Pong: Animation plays forward then backward">
                        <button
                            className={clsx(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                                animation.pingPong
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                    : "bg-zinc-700/50 text-zinc-400 border border-zinc-600"
                            )}
                        >
                            {animation.pingPong ? <Check size={12} /> : <X size={12} />}
                            Ping-Pong
                        </button>
                    </Tooltip>

                    <div className="flex-1" />

                    <Tooltip content={<ScaleTooltipContent scale={transform.scale} />}>
                        <span className="text-xs text-zinc-500">
                            Scale: <strong className="text-zinc-300">{transform.scale.toFixed(1)}x</strong>
                        </span>
                    </Tooltip>
                </div>
            )}
        </div>
    );
}
