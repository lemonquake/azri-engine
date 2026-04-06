import { useEffect, useState, useRef } from 'react';
import { clsx } from 'clsx';
import anime from 'animejs';

interface PlayerHUDProps {
    hp: number;
    maxHp: number;
    exp: number;
    maxExp: number;
    level: number;
    wallJumps?: number;
    maxWallJumps?: number;
    wallFriction?: number;
}

export function PlayerHUD({ hp, maxHp, exp, maxExp, level, wallJumps = 4, maxWallJumps = 4, wallFriction = 0 }: PlayerHUDProps) {
    const [isDamaged, setIsDamaged] = useState(false);
    const [prevHp, setPrevHp] = useState(hp);
    const [prevExp, setPrevExp] = useState(exp);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const hpBarRef = useRef<HTMLDivElement>(null);
    const expBarRef = useRef<HTMLDivElement>(null);

    const hpPercent = Math.min(100, Math.max(0, (hp / maxHp) * 100));
    const expPercent = Math.min(100, Math.max(0, (exp / maxExp) * 100));

    useEffect(() => {
        if (!hpBarRef.current) return;
        anime({
            targets: hpBarRef.current,
            width: `${hpPercent}%`,
            duration: hp < prevHp ? 200 : 800, // Faster on damage, elastic on heal
            easing: hp < prevHp ? 'easeOutQuad' : 'easeOutElastic(1, .8)'
        });

        if (hp < prevHp) {
            setIsDamaged(true);
            const timer = setTimeout(() => setIsDamaged(false), 300);
            
            // Anime shake for the entire HUD
            if (containerRef.current) {
                anime({
                    targets: containerRef.current,
                    translateX: [
                        { value: 10, duration: 50 },
                        { value: -10, duration: 50 },
                        { value: 5, duration: 50 },
                        { value: 0, duration: 50 }
                    ],
                    translateY: [
                        { value: 5, duration: 50 },
                        { value: -5, duration: 50 },
                        { value: 0, duration: 50 }
                    ],
                    easing: 'easeInOutSine'
                });
            }

            setPrevHp(hp);
            return () => clearTimeout(timer);
        }
        setPrevHp(hp);
    }, [hp, prevHp, hpPercent]);

    useEffect(() => {
        if (!expBarRef.current) return;
        anime({
            targets: expBarRef.current,
            width: `${expPercent}%`,
            duration: 1000,
            easing: 'easeOutElastic(1, .6)'
        });
        setPrevExp(exp);
    }, [exp, prevExp, expPercent]);

    return (
        <div ref={containerRef} className="absolute bottom-6 left-6 flex flex-col gap-3 w-80 select-none pointer-events-none" style={{ fontFamily: "'Press Start 2P', monospace" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
                @keyframes intense-vibrate {
                    0%, 100% { transform: translate(0, 0); }
                    25% { transform: translate(-2px, 1px); }
                    50% { transform: translate(2px, -1px); }
                    75% { transform: translate(-2px, -1px); }
                }
                .animate-intense-vibrate {
                    animation: intense-vibrate 0.1s infinite;
                }
                @keyframes intense-flash {
                    0%, 100% { border-color: #ef4444; box-shadow: 0 0 10px 2px rgba(239,68,68,0.8); }
                    50% { border-color: #ff0000; box-shadow: 0 0 20px 8px rgba(255,0,0,1); }
                }
                .animate-intense-flash {
                    animation: intense-flash 0.15s infinite;
                }
                .retro-text-shadow {
                    text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000;
                }
            `}</style>

            <div className="relative">

                {/* Level Frame */}
                <div className="absolute -top-6 -left-6 w-16 h-16 bg-slate-900 border-4 border-slate-600 flex flex-col items-center justify-center shadow-2xl z-20 skew-x-[-10deg]">
                    <span className="text-white text-xl retro-text-shadow text-amber-400 skew-x-[10deg]">{level}</span>
                    <div className="text-[8px] text-slate-400 mt-1 skew-x-[10deg]">LVL</div>
                </div>

                {/* HP BAR Background wrapper - thicker and pixel-art styled */}
                <div className="ml-8 relative h-10 bg-slate-900 border-4 border-slate-600 shadow-2xl skew-x-[-10deg] overflow-hidden">

                    {/* Fill */}
                    <div
                        ref={hpBarRef}
                        className="absolute top-0 left-0 h-full flex flex-col"
                        style={{ width: `${hpPercent}%` }}
                    >
                        {/* Retro gradient blocky look */}
                        <div className="h-1/3 w-full bg-emerald-400"></div>
                        <div className="h-1/3 w-full bg-emerald-500"></div>
                        <div className="h-1/3 w-full bg-emerald-600"></div>
                        <div className="absolute inset-0 shadow-[inset_0_0_10px_rgba(0,255,0,0.5)]"></div>
                    </div>

                    {/* Text Overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-4 text-white retro-text-shadow skew-x-[10deg]">
                        <div className="flex items-center gap-2">
                            <span className={clsx("text-red-500 text-[10px]", isDamaged && "animate-pulse")}>HP</span>
                        </div>
                        <span className="text-sm tracking-widest">{Math.ceil(hp)}/{maxHp}</span>
                    </div>
                </div>

                {/* JUMP BAR - 4 distinct segments */}
                <div className="ml-8 mt-2 flex gap-1.5 h-4 skew-x-[-10deg]">
                    {Array.from({ length: maxWallJumps }).map((_, i) => (
                        <div
                            key={i}
                            className={clsx(
                                "flex-1 border-[3px] transition-colors duration-200",
                                i < wallJumps
                                    ? "bg-cyan-400 border-cyan-100 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                    : "bg-slate-800 border-slate-900 opacity-60"
                            )}
                        />
                    ))}
                </div>

                {/* EXP BAR (thin line under jump) */}
                <div className="ml-8 mt-2 relative h-2 bg-slate-900 border-2 border-slate-700 skew-x-[-10deg]">
                    <div
                        ref={expBarRef}
                        className="absolute top-0 left-0 h-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]"
                        style={{ width: `${expPercent}%` }}
                    ></div>
                </div>

                {/* WALL FRICTION BURN METER */}
                <div
                    className={clsx(
                        "ml-8 mt-1 relative h-2 border-2 skew-x-[-10deg] transition-all duration-300",
                        wallFriction > 0 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4",
                        wallFriction >= 100 ? "animate-intense-vibrate animate-intense-flash" : "border-slate-800 bg-slate-900"
                    )}
                >
                    <div
                        className={clsx(
                            "absolute top-0 left-0 h-full transition-all duration-100 ease-linear",
                            wallFriction >= 100 ? "bg-red-500" : "bg-orange-500"
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, wallFriction))}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
}
