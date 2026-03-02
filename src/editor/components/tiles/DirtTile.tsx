// DirtTile.tsx
import React from 'react';
import './DirtTile.css';

interface DirtTileProps {
    x: number;
    y: number;
    size: number;
    isInterior?: boolean;
}

export const DirtTile: React.FC<DirtTileProps> = ({ x, y, size, isInterior = false }) => {
    return (
        <div
            className="absolute pointer-events-none"
            style={{
                left: x,
                top: y,
                width: size,
                height: size,
            }}
        >
            {isInterior ? (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#614022' }} />
            ) : (
                <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 32 32"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                >
                    <rect width="32" height="32" className="dirt-base" />
                    <path className="dirt-shadow" d="M 4 4 h 2 v 2 h -2 z M 24 8 h 2 v 2 h -2 z M 12 20 h 2 v 2 h -2 z M 28 26 h 2 v 2 h -2 z M 2 24 h 2 v 2 h -2 z" />
                    <path className="dirt-highlight" d="M 6 12 Q 10 10 14 14 T 22 16 T 28 12 L 28 14 Q 22 18 14 16 T 6 14 Z" />
                    <path className="dirt-highlight" d="M -2 28 Q 6 24 16 30 T 34 26 L 34 28 Q 16 32 6 26 T -2 30 Z" style={{ animationDelay: '1s' }} />
                </svg>
            )}
        </div>
    );
};
