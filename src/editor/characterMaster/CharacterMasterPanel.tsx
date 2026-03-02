/**
 * CharacterMasterPanel - Main panel for sprite sheet animation
 */
import React, { useCallback, useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
    Upload, Image as ImageIcon, Film, Play, Plus, Trash2,
    FileImage, Palette, Download, User
} from 'lucide-react';
import { useCharacterMasterStore } from './characterMasterStore';
import { SpriteSheetCanvas } from './components/SpriteSheetCanvas';
import { FrameSelector } from './components/FrameSelector';
import { AnimationTimeline } from './components/AnimationTimeline';
import { AnimationPreview } from './components/AnimationPreview';
import { TransformControls } from './components/TransformControls';
// import { SpriteTypeSelector } from './components/SpriteTypeSelector'; // Removed
import { GridControls } from './components/GridControls';
import { CharacterCreator } from './components/CharacterCreator';
import { Tooltip, TooltipContent } from './components/Tooltip';
import { DEFAULT_SPRITE_SHEET } from './types';
import { SpriteMakerPanel } from './spritemaker/SpriteMakerPanel';
import { AnimationExportDialog } from './components/AnimationExportDialog'; // Import new component

export function CharacterMasterPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const mode = useCharacterMasterStore(s => s.mode);
    const setMode = useCharacterMasterStore(s => s.setMode);

    const loadedImage = useCharacterMasterStore(s => s.loadedImage);
    const setLoadedImage = useCharacterMasterStore(s => s.setLoadedImage);

    const activeAnimationId = useCharacterMasterStore(s => s.activeAnimationId);
    const animations = useCharacterMasterStore(s => s.animations);

    const activeSpriteSheetId = useCharacterMasterStore(s => s.activeSpriteSheetId);
    const spriteSheets = useCharacterMasterStore(s => s.spriteSheets);
    const sheet = activeSpriteSheetId ? spriteSheets.get(activeSpriteSheetId) : null;

    const addSpriteSheet = useCharacterMasterStore(s => s.addSpriteSheet);
    const createAnimation = useCharacterMasterStore(s => s.createAnimation);
    const setActiveAnimation = useCharacterMasterStore(s => s.setActiveAnimation);
    const deleteAnimation = useCharacterMasterStore(s => s.deleteAnimation);
    const initStore = useCharacterMasterStore(s => s.init);

    useEffect(() => {
        initStore();
    }, [initStore]);

    // Helper to convert blob to base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    // Handle file upload
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const base64 = await fileToBase64(file);
            const img = new window.Image();
            img.onload = () => {
                setLoadedImage(img);
                addSpriteSheet({
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    imageSrc: base64, // Use base64 for immediate display too, or could use blob
                    imageWidth: img.width,
                    imageHeight: img.height,
                    ...DEFAULT_SPRITE_SHEET,
                    columns: Math.max(1, Math.floor(img.width / DEFAULT_SPRITE_SHEET.frameWidth)),
                    rows: Math.max(1, Math.floor(img.height / DEFAULT_SPRITE_SHEET.frameHeight)),
                }, base64); // Pass base64 for persistence
            };
            img.src = base64;
        } catch (err) {
            console.error("Failed to load file:", err);
        }

        // Reset file input
        e.target.value = '';
    }, [setLoadedImage, addSpriteSheet]);

    // Handle drag and drop
    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        try {
            const base64 = await fileToBase64(file);
            const img = new window.Image();
            img.onload = () => {
                setLoadedImage(img);
                addSpriteSheet({
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    imageSrc: base64,
                    imageWidth: img.width,
                    imageHeight: img.height,
                    ...DEFAULT_SPRITE_SHEET,
                    columns: Math.max(1, Math.floor(img.width / DEFAULT_SPRITE_SHEET.frameWidth)),
                    rows: Math.max(1, Math.floor(img.height / DEFAULT_SPRITE_SHEET.frameHeight)),
                }, base64);
            };
            img.src = base64;
        } catch (err) {
            console.error("Failed to load file:", err);
        }
    }, [setLoadedImage, addSpriteSheet]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleCreateAnimation = useCallback(() => {
        const name = `Animation ${animations.size + 1}`;
        createAnimation(name);
    }, [animations.size, createAnimation]);

    const isPlaying = useCharacterMasterStore(s => s.playback.isPlaying);
    const play = useCharacterMasterStore(s => s.play);
    const pause = useCharacterMasterStore(s => s.pause);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.code === 'Enter') {
                e.preventDefault();
                if (isPlaying) {
                    pause();
                } else {
                    play();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, play, pause]);

    const animationsList = Array.from(animations.values());

    const [showExportDialog, setShowExportDialog] = useState(false);

    // ... existing initialization code ...

    return (
        <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700 bg-zinc-800/50">
                {/* ... existing mode tabs ... */}
                <div className="flex items-center bg-zinc-700/50 rounded-lg p-1">
                    <Tooltip content="View and configure sprite sheet frames">
                        <button
                            onClick={() => setMode('sheet')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
                                "transition-all duration-150",
                                mode === 'sheet'
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-600/50"
                            )}
                        >
                            <ImageIcon size={14} />
                            Sheet
                        </button>
                    </Tooltip>
                    <Tooltip content="Build and edit animations">
                        <button
                            onClick={() => setMode('animation')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
                                "transition-all duration-150",
                                mode === 'animation'
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-600/50"
                            )}
                        >
                            <Film size={14} />
                            Animate
                        </button>
                    </Tooltip>
                    <Tooltip content="Preview animations with transform controls">
                        <button
                            onClick={() => setMode('preview')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
                                "transition-all duration-150",
                                mode === 'preview'
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-600/50"
                            )}
                        >
                            <Play size={14} />
                            Preview
                        </button>
                    </Tooltip>
                    <Tooltip content="Create new sprites with pixel art tools">
                        <button
                            onClick={() => setMode('create')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
                                "transition-all duration-150",
                                mode === 'create'
                                    ? "bg-purple-600 text-white shadow-lg"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-600/50"
                            )}
                        >
                            <Palette size={14} />
                            Create
                        </button>
                    </Tooltip>
                    <Tooltip content="Manage characters and assign animations">
                        <button
                            onClick={() => setMode('character')}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
                                "transition-all duration-150",
                                mode === 'character'
                                    ? "bg-blue-600 text-white shadow-lg"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-600/50"
                            )}
                        >
                            <User size={14} />
                            Character
                        </button>
                    </Tooltip>
                </div>

                <div className="w-px h-6 bg-zinc-600" />

                {/* Load button */}
                <Tooltip
                    content={
                        <TooltipContent
                            icon={<Upload size={14} />}
                            title="Load Sprite Sheet"
                            description="Upload a PNG, JPG, or WebP image containing your sprite frames"
                            shortcut="Ctrl+O"
                        />
                    }
                >
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                            "bg-emerald-600/20 border border-emerald-500/30",
                            "hover:bg-emerald-600/30 text-emerald-300",
                            "transition-colors"
                        )}
                    >
                        <Upload size={14} />
                        Load Sheet
                    </button>
                </Tooltip>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                />

                {/* Sheet info */}
                {sheet && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                        <FileImage size={12} />
                        <span className="font-medium text-zinc-300">{sheet.name}</span>
                        <span className="text-zinc-500">
                            {sheet.imageWidth}×{sheet.imageHeight}
                        </span>
                    </div>
                )}

                <div className="flex-1" />

                {/* Animation selector */}
                {mode !== 'sheet' && (
                    <div className="flex items-center gap-2">
                        {/* Export Button (Only in Animation Mode) */}
                        {mode === 'animation' && (
                            <Tooltip content="Export animation as GIF, Sprite Sheet, or ZIP">
                                <button
                                    onClick={() => setShowExportDialog(true)}
                                    // disabled={!activeAnimationId} // Optional: disable if no animation
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm mr-2",
                                        "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30",
                                        "hover:bg-indigo-600/30",
                                        "transition-colors"
                                    )}
                                >
                                    <Download size={14} />
                                    Export
                                </button>
                            </Tooltip>
                        )}

                        <select
                            value={activeAnimationId || ''}
                            onChange={(e) => setActiveAnimation(e.target.value || null)}
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-sm",
                                "bg-zinc-700 border border-zinc-600",
                                "text-zinc-100 focus:outline-none focus:border-indigo-500",
                                "min-w-[160px]"
                            )}
                        >
                            <option value="">Select Animation...</option>
                            {animationsList.map((anim) => (
                                <option key={anim.id} value={anim.id}>
                                    {anim.name} ({anim.frames.length} frames)
                                </option>
                            ))}
                        </select>

                        <Tooltip content="Create new animation">
                            <button
                                onClick={handleCreateAnimation}
                                className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                            >
                                <Plus size={16} className="text-emerald-400" />
                            </button>
                        </Tooltip>

                        {activeAnimationId && (
                            <Tooltip content="Delete animation">
                                <button
                                    onClick={() => deleteAnimation(activeAnimationId)}
                                    className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                                >
                                    <Trash2 size={16} className="text-red-400" />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden relative">
                {mode === 'character' ? (
                    <CharacterCreator />
                ) : (
                    <>
                        <div
                            className="flex-1 flex flex-col min-w-0"
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                        >
                            {/* Workspace */}
                            <div className="flex-1 relative overflow-hidden bg-zinc-900">
                                {mode === 'create' ? (
                                    <SpriteMakerPanel />
                                ) : !loadedImage ? (
                                    <div
                                        className={clsx(
                                            "flex items-center justify-center h-full",
                                            "border-2 border-dashed border-zinc-700 m-8 rounded-xl",
                                            "bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-600",
                                            "transition-colors cursor-pointer group"
                                        )}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <div className="text-center">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-700/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Upload size={28} className="text-zinc-400 group-hover:text-zinc-200" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
                                                Load a Sprite Sheet
                                            </h3>
                                            <p className="text-sm text-zinc-500 mb-4">
                                                Drag and drop an image here, or click to browse
                                            </p>
                                        </div>
                                    </div>
                                ) : mode === 'preview' ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <AnimationPreview />
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 overflow-hidden bg-zinc-950">
                                        <SpriteSheetCanvas className="w-full h-full" />
                                    </div>
                                )}
                            </div>

                            {/* Timeline */}
                            {mode !== 'create' && (
                                <div className="h-72 border-t border-zinc-700 bg-zinc-800 flex flex-col">
                                    <div className="px-4 py-2 border-b border-zinc-700 font-medium text-xs text-zinc-400 bg-zinc-800">
                                        TIMELINE
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <AnimationTimeline />
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Right sidebar */}
                        {mode !== 'create' && (
                            <aside className="w-80 border-l border-zinc-700 bg-zinc-800 overflow-y-auto">
                                <div className="p-4 space-y-6">
                                    {(mode === 'sheet' || mode === 'animation') && (
                                        <>
                                            <FrameSelector />
                                            <div className="h-px bg-zinc-700" />
                                            <GridControls />
                                            <div className="h-px bg-zinc-700" />
                                            <TransformControls />
                                        </>
                                    )}

                                    {mode === 'preview' && (
                                        <TransformControls />
                                    )}

                                    {mode === 'sheet' && sheet && (
                                        <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-700/50 text-sm text-zinc-400">
                                            <h4 className="font-medium text-zinc-300 mb-2">Selection Info</h4>
                                            <p>Select frames in the canvas to add them to your animation.</p>
                                        </div>
                                    )}
                                </div>
                            </aside>
                        )}
                    </>
                )}
            </div>

            {/* Animation Export Dialog */}
            {
                showExportDialog && (
                    <AnimationExportDialog onClose={() => setShowExportDialog(false)} />
                )
            }
        </div >
    );
}


