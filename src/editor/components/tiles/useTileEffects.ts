import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { TileGlow } from '../../types';

export function useTileEffects(
    ref: RefObject<HTMLElement | null>,
    options: {
        glowColor?: string;
        glow?: TileGlow;
    }
) {
    useEffect(() => {
        const { glowColor, glow } = options;
        if (!ref.current) return;

        if (!glowColor && (!glow || (glow.style !== 'pulsing' && glow.style !== 'multi-color' && glow.style !== 'random'))) {
            let baseGlowColor = glowColor || glow?.color || '#ffffff';
            let baseIntensity = glow?.intensity ?? 15;
            ref.current.style.filter = (glowColor || glow) ? `drop-shadow(0px 0px ${baseIntensity}px ${baseGlowColor})` : '';
            return;
        }

        let frameId: number;

        const updateEffect = () => {
            if (!ref.current) return;

            let currentGlowColor = glowColor || glow?.color || '#ffffff';
            let intensity = glow?.intensity ?? 15;

            if (glow) {
                const time = performance.now() / 1000;
                const speed = glow.speed || 1;

                if (glow.style === 'pulsing') {
                    const pulse = (Math.sin(time * speed * Math.PI) + 1) / 2;
                    intensity = intensity * (0.5 + 0.5 * pulse);
                } else if (glow.style === 'multi-color' && glow.colors && glow.colors.length > 0) {
                    const lerpHex = (a: string, b: string, t: number) => {
                        if (!a || !b) return a || b || '#ffffff';
                        const ah = parseInt(a.replace('#', ''), 16);
                        const ar = (ah >> 16) & 255; const ag = (ah >> 8) & 255; const ab = ah & 255;
                        const bh = parseInt(b.replace('#', ''), 16);
                        const br = (bh >> 16) & 255; const bg = (bh >> 8) & 255; const bb = bh & 255;
                        const rr = Math.round(ar + (br - ar) * t);
                        const rg = Math.round(ag + (bg - ag) * t);
                        const rb = Math.round(ab + (bb - ab) * t);
                        return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
                    };
                    const t = (time * speed) % glow.colors.length;
                    const idx1 = Math.floor(t);
                    const idx2 = (idx1 + 1) % glow.colors.length;
                    const blend = t - idx1;
                    currentGlowColor = lerpHex(glow.colors[idx1], glow.colors[idx2], blend);
                } else if (glow.style === 'random') {
                    intensity = intensity * (0.5 + Math.random() * 0.5);
                    if (glow.colors && glow.colors.length > 0) {
                        const tHash = Math.floor(time * speed * 10);
                        const idx = tHash % glow.colors.length;
                        currentGlowColor = glow.colors[idx];
                    } else {
                        const timeHash = Math.floor(time * speed * 10);
                        const r = (timeHash * 13) % 255;
                        const g = (timeHash * 17) % 255;
                        const b = (timeHash * 23) % 255;
                        currentGlowColor = `rgb(${r},${g},${b})`;
                    }
                }
            }

            ref.current.style.filter = `drop-shadow(0px 0px ${intensity}px ${currentGlowColor})`;
            frameId = requestAnimationFrame(updateEffect);
        };

        frameId = requestAnimationFrame(updateEffect);
        return () => cancelAnimationFrame(frameId);
    }, [options.glowColor, options.glow]);
}
