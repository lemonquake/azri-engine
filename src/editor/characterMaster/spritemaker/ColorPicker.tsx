/**
 * ColorPicker - HSV/RGB/Hex color picker with palette presets
 */
import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { Palette, RotateCcw } from 'lucide-react';
import { useDrawingStore, PALETTES, type Color } from './stores/drawingStore';

interface ColorPickerProps {
    className?: string;
}

// Convert RGB to HSV
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h * 360, s * 100, v * 100];
}

// Convert HSV to RGB
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    h /= 360; s /= 100; v /= 100;

    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Convert RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Convert Hex to RGB
function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
}

export function ColorPicker({ className }: ColorPickerProps) {
    const {
        foregroundColor,
        backgroundColor,
        setForegroundColor,
        setBackgroundColor,
        swapColors,
        recentColors,
    } = useDrawingStore();

    const [hsv, setHsv] = useState(() => {
        const [h, s, v] = rgbToHsv(foregroundColor.r, foregroundColor.g, foregroundColor.b);
        return { h, s, v };
    });

    const [hexInput, setHexInput] = useState(() =>
        rgbToHex(foregroundColor.r, foregroundColor.g, foregroundColor.b)
    );

    const [activePalette, setActivePalette] = useState<keyof typeof PALETTES>('pico8');
    const [editingBackground, setEditingBackground] = useState(false);

    const updateColor = useCallback((newHsv: { h: number; s: number; v: number }) => {
        setHsv(newHsv);
        const [r, g, b] = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
        const color: Color = { r, g, b, a: 255 };

        if (editingBackground) {
            setBackgroundColor(color);
        } else {
            setForegroundColor(color);
        }

        setHexInput(rgbToHex(r, g, b));
    }, [editingBackground, setForegroundColor, setBackgroundColor]);

    const handleHexChange = useCallback((hex: string) => {
        setHexInput(hex);
        const rgb = hexToRgb(hex);
        if (rgb) {
            const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
            setHsv({ h, s, v });

            const color: Color = { r: rgb[0], g: rgb[1], b: rgb[2], a: 255 };
            if (editingBackground) {
                setBackgroundColor(color);
            } else {
                setForegroundColor(color);
            }
        }
    }, [editingBackground, setForegroundColor, setBackgroundColor]);

    const selectPaletteColor = useCallback((color: Color) => {
        const [h, s, v] = rgbToHsv(color.r, color.g, color.b);
        setHsv({ h, s, v });
        setHexInput(rgbToHex(color.r, color.g, color.b));

        if (editingBackground) {
            setBackgroundColor(color);
        } else {
            setForegroundColor(color);
        }
    }, [editingBackground, setForegroundColor, setBackgroundColor]);

    const currentColor = editingBackground ? backgroundColor : foregroundColor;
    const currentHex = rgbToHex(currentColor.r, currentColor.g, currentColor.b);

    return (
        <div className={clsx("space-y-3 p-3 bg-zinc-800 rounded-lg", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <Palette size={14} />
                    Color
                </h3>
                <div className="flex gap-1">
                    <button
                        onClick={() => setEditingBackground(false)}
                        className={clsx(
                            "px-2 py-0.5 text-xs rounded",
                            !editingBackground ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                        )}
                    >
                        FG
                    </button>
                    <button
                        onClick={() => setEditingBackground(true)}
                        className={clsx(
                            "px-2 py-0.5 text-xs rounded",
                            editingBackground ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                        )}
                    >
                        BG
                    </button>
                </div>
            </div>

            {/* HSV Sliders */}
            <div className="space-y-2">
                {/* Hue */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Hue</span>
                        <span>{Math.round(hsv.h)}°</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="360"
                        value={hsv.h}
                        onChange={(e) => updateColor({ ...hsv, h: parseInt(e.target.value) })}
                        className="w-full h-3 rounded appearance-none cursor-pointer"
                        style={{
                            background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                        }}
                    />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Saturation</span>
                        <span>{Math.round(hsv.s)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={hsv.s}
                        onChange={(e) => updateColor({ ...hsv, s: parseInt(e.target.value) })}
                        className="w-full h-3 rounded appearance-none cursor-pointer bg-zinc-600"
                    />
                </div>

                {/* Value/Brightness */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Brightness</span>
                        <span>{Math.round(hsv.v)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={hsv.v}
                        onChange={(e) => updateColor({ ...hsv, v: parseInt(e.target.value) })}
                        className="w-full h-3 rounded appearance-none cursor-pointer bg-zinc-600"
                    />
                </div>
            </div>

            {/* Hex Input */}
            <div className="flex items-center gap-2">
                <div
                    className="w-8 h-8 rounded border-2 border-zinc-600"
                    style={{ backgroundColor: currentHex }}
                />
                <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm font-mono text-zinc-200"
                    placeholder="#000000"
                />
                <button
                    onClick={swapColors}
                    title="Swap FG/BG"
                    className="p-1.5 bg-zinc-700 rounded hover:bg-zinc-600 text-zinc-400"
                >
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Palette Selector */}
            <div className="space-y-2">
                <div className="flex items-center gap-1">
                    {(Object.keys(PALETTES) as Array<keyof typeof PALETTES>).map((name) => (
                        <button
                            key={name}
                            onClick={() => setActivePalette(name)}
                            className={clsx(
                                "px-2 py-0.5 text-xs rounded capitalize",
                                activePalette === name
                                    ? "bg-indigo-600 text-white"
                                    : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                            )}
                        >
                            {name}
                        </button>
                    ))}
                </div>

                {/* Palette Colors */}
                <div className="grid grid-cols-8 gap-1">
                    {PALETTES[activePalette].map((color, i) => (
                        <button
                            key={i}
                            onClick={() => selectPaletteColor(color)}
                            className="w-6 h-6 rounded border border-zinc-600 hover:border-white hover:scale-110 transition-transform"
                            style={{ backgroundColor: rgbToHex(color.r, color.g, color.b) }}
                        />
                    ))}
                </div>
            </div>

            {/* Recent Colors */}
            {recentColors.length > 0 && (
                <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Recent</span>
                    <div className="flex flex-wrap gap-1">
                        {recentColors.slice(0, 8).map((color, i) => (
                            <button
                                key={i}
                                onClick={() => selectPaletteColor(color)}
                                className="w-5 h-5 rounded border border-zinc-600 hover:border-white"
                                style={{ backgroundColor: rgbToHex(color.r, color.g, color.b) }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
