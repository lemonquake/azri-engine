// LavaTile.tsx
import React, { useRef } from 'react';
import './LavaTile.css';
import { useTileEffects } from './useTileEffects';
import type { TileGlow } from '../../types';

interface LavaTileProps {
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

export const LavaTile: React.FC<LavaTileProps> = ({ x, y, size, opacity = 1, rotation = 0, scaleX = 1, scaleY = 1, glowColor, glow }) => {
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
                <rect width="32" height="32" className="lava-base" />

                {/* Flowing magma lines */}
                <path className="lava-flow lava-flow-1" d="M 0 8 Q 8 4 16 12 T 32 8" />
                <path className="lava-flow lava-flow-2" d="M 0 20 Q 12 26 20 18 T 32 22" />
                <path className="lava-flow lava-flow-3" d="M 8 0 Q 14 10 8 20 T 12 32" />

                {/* Bubbles */}
                <circle className="lava-bubble lava-bubble-1" cx="6" cy="14" r="2" />
                <circle className="lava-bubble lava-bubble-2" cx="24" cy="8" r="1.5" />
                <circle className="lava-bubble lava-bubble-3" cx="16" cy="24" r="2.5" />
                <circle className="lava-bubble lava-bubble-4" cx="28" cy="28" r="1" />
            </svg>
        </div>
    );
};
