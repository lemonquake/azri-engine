// GrassTile.tsx
import React, { useRef } from 'react';
import './GrassTile.css';
import { useTileEffects } from './useTileEffects';
import type { TileGlow } from '../../types';

interface GrassTileProps {
    x: number;
    y: number;
    size: number;
    isReacting?: boolean;
    opacity?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    glowColor?: string;
    glow?: TileGlow;
}

export const GrassTile: React.FC<GrassTileProps> = ({ x, y, size, isReacting, opacity = 1, rotation = 0, scaleX = 1, scaleY = 1, glowColor, glow }) => {
    const ref = useRef<HTMLDivElement>(null);
    useTileEffects(ref, { glowColor, glow });

    return (
        <div
            ref={ref}
            className={`absolute pointer-events-none grass-group ${isReacting ? 'reacting' : ''}`}
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
                {/* Simple stylized grass blades */}
                {/* Blade 1 - back left */}
                <path className="grass-blade grass-blade-1 fill-[#1e7a1e]" d="M 6 32 Q 4 20 2 12 Q 7 16 8 32 Z" />
                {/* Blade 2 - back right */}
                <path className="grass-blade grass-blade-2 fill-[#208520]" d="M 26 32 Q 28 20 30 14 Q 25 18 24 32 Z" />
                {/* Blade 3 - main center */}
                <path className="grass-blade grass-blade-3 fill-[#2ea62e]" d="M 12 32 Q 10 15 14 6 Q 18 16 20 32 Z" />
                {/* Blade 4 - front small */}
                <path className="grass-blade grass-blade-4 fill-[#39c439]" d="M 18 32 Q 22 22 26 16 Q 16 22 14 32 Z" />
                {/* Blade 5 - front left */}
                <path className="grass-blade grass-blade-1 fill-[#1bcf1b]" d="M 8 32 Q 10 24 6 16 Q 12 24 14 32 Z" />
            </svg>
        </div>
    );
};
