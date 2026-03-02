// CrystalTile.tsx
import React, { useRef } from 'react';
import './CrystalTile.css';
import { useTileEffects } from './useTileEffects';
import type { TileGlow } from '../../types';

interface CrystalTileProps {
    x: number;
    y: number;
    size: number;
    opacity?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    glowColor?: string;
    glow?: TileGlow;
}

export const CrystalTile: React.FC<CrystalTileProps> = ({ x, y, size, opacity = 1, rotation = 0, scaleX = 1, scaleY = 1, glowColor, glow }) => {
    const ref = useRef<HTMLDivElement>(null);
    useTileEffects(ref, { glowColor, glow });

    return (
        <div
            ref={ref}
            className="absolute pointer-events-none crystal-group"
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
                {/* Base Glow */}
                <circle cx="16" cy="16" r="14" className="crystal-glow-base hidden" />

                {/* Crystal Shards */}
                <path className="crystal-shard crystal-shard-1" d="M 16 2 L 22 14 L 16 28 L 10 14 Z" />
                <path className="crystal-shard crystal-shard-2" d="M 10 14 L 16 28 L 6 22 L 4 16 Z" />
                <path className="crystal-shard crystal-shard-3" d="M 22 14 L 28 16 L 26 22 L 16 28 Z" />

                {/* Highlights */}
                <path className="crystal-highlight" d="M 16 4 L 18 14 L 16 24 Z" />
                <path className="crystal-highlight" style={{ opacity: 0.4 }} d="M 8 16 L 12 18 L 14 24 Z" />
            </svg>
        </div>
    );
};
