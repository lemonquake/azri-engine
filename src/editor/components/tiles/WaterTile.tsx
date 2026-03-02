// WaterTile.tsx
import React, { useRef } from 'react';
import './WaterTile.css';
import { useTileEffects } from './useTileEffects';
import type { TileGlow } from '../../types';

interface WaterTileProps {
    x: number;
    y: number;
    size: number;
    isSurface?: boolean; // Determines if we draw the wavy top
    opacity?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    glowColor?: string;
    glow?: TileGlow;
}

export const WaterTile: React.FC<WaterTileProps> = ({ x, y, size, isSurface = true, opacity = 1, rotation = 0, scaleX = 1, scaleY = 1, glowColor, glow }) => {
    const ref = useRef<HTMLDivElement>(null);
    useTileEffects(ref, { glowColor, glow });

    return (
        <div
            ref={ref}
            className="absolute pointer-events-none"
            style={{
                left: x,
                top: y,
                width: size,
                height: size,
                opacity,
                transform: `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'center center'
            }}
        >
            <svg
                width="100%"
                height="100%"
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
            >
                <rect width="32" height="32" className="water-base" />

                {isSurface && (
                    <>
                        <path className="water-highlight" d="M 0 6 Q 8 2 16 6 T 32 6 L 32 10 L 0 10 Z" />
                        <path className="water-surface-line" d="M -4 4 Q 8 0 16 4 T 36 4" />
                    </>
                )}

                {/* Sub-surface details */}
                <path className="water-surface-line" d="M 4 16 Q 10 14 16 16 T 28 16" style={{ animationDelay: '1s', opacity: 0.5 }} />
                <path className="water-surface-line" d="M 8 26 Q 16 24 24 26" style={{ animationDelay: '2.5s', opacity: 0.3 }} />
            </svg>
        </div>
    );
};
