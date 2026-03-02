import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Heart } from 'lucide-react';

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

export function PlayerHUD({ hp, maxHp, exp, maxExp, level, wallJumps = 3, maxWallJumps = 3, wallFriction = 0 }: PlayerHUDProps) {
    // Local state for animations (e.g., shake on damage)
    const [isDamaged, setIsDamaged] = useState(false);
    const [prevHp, setPrevHp] = useState(hp);

    useEffect(() => {
        if (hp < prevHp) {
            setIsDamaged(true);
            const timer = setTimeout(() => setIsDamaged(false), 300);
            return () => clearTimeout(timer);
        }
        setPrevHp(hp);
    }, [hp, prevHp]);

    const hpPercent = Math.min(100, Math.max(0, (hp / maxHp) * 100));
    const expPercent = Math.min(100, Math.max(0, (exp / maxExp) * 100));

    return (
        <div className="absolute bottom-4 left-4 flex flex-col gap-2 w-64 select-none pointer-events-none">
            {/* Level Badge & HP Container */}
            <div className={clsx("relative transition-transform duration-100", isDamaged && "translate-x-1 translate-y-1")}>

                {/* HP BAR */}
                <div className="relative h-6 bg-slate-900/80 rounded-lg overflow-hidden border border-slate-700 shadow-lg backdrop-blur-sm">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>

                    {/* Fill */}
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-400 transition-all duration-300 ease-out"
                        style={{ width: `${hpPercent}%` }}
                    >
                        {/* Glow / Shine */}
                        <div className="absolute top-0 right-0 w-8 h-full bg-white/30 skew-x-[-20deg] blur-sm"></div>
                        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-white/10"></div>
                    </div>

                    {/* Text Overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-white drop-shadow-md">
                        <div className="flex items-center gap-1">
                            <Heart size={12} className={clsx("text-red-400", isDamaged && "animate-pulse")} fill="currentColor" />
                            <span>HP</span>
                        </div>
                        <span>{Math.ceil(hp)} / {maxHp}</span>
                    </div>
                </div>

                {/* EXP BAR */}
                <div className="mt-1 relative h-2 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/50 shadow-md">
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-300 transition-all duration-500 ease-out"
                        style={{ width: `${expPercent}%` }}
                    >
                        <div className="absolute top-0 right-0 w-2 h-full bg-white/50 blur-[1px]"></div>
                    </div>
                </div>

                {/* WALL JUMP BAR */}
                <style>{`
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
                        0%, 100% { background-color: #ef4444; box-shadow: 0 0 10px 2px rgba(239,68,68,0.8); }
                        50% { background-color: #ff0000; box-shadow: 0 0 20px 8px rgba(255,0,0,1); }
                    }
                    .animate-intense-flash {
                        animation: intense-flash 0.15s infinite;
                    }
                `}</style>
                <div className={clsx(
                    "mt-1 relative h-1.5 rounded-full overflow-hidden shadow-md",
                    wallJumps <= 0
                        ? "bg-red-900 border border-red-500 animate-intense-vibrate animate-intense-flash"
                        : "bg-slate-900/80 border border-slate-700/50"
                )}>
                    <div
                        className={clsx(
                            "absolute top-0 left-0 h-full transition-all duration-300 ease-out",
                            wallJumps <= 0 ? "bg-red-500 animate-pulse" : "bg-gradient-to-r from-emerald-500 to-green-400"
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, (wallJumps / maxWallJumps) * 100))}%` }}
                    ></div>
                </div>

                {/* WALL FRICTION BURN METER */}
                <div
                    className={clsx(
                        "mt-1 relative h-1 rounded-full overflow-hidden shadow-md transition-all duration-300",
                        wallFriction > 0 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4",
                        wallFriction >= 100 ? "animate-intense-vibrate animate-intense-flash" : "border border-amber-900/50 bg-slate-900/80"
                    )}
                >
                    <div
                        className={clsx(
                            "absolute top-0 left-0 h-full transition-all duration-100 ease-linear",
                            wallFriction >= 100 ? "bg-red-500" : "bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500"
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, wallFriction))}%` }}
                    ></div>
                </div>

                {/* Level Circle */}
                <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-full border-2 border-indigo-400 flex items-center justify-center shadow-xl z-10">
                    <span className="text-white font-bold text-sm drop-shadow-sm">{level}</span>
                    <div className="absolute bottom-0 text-[8px] text-indigo-200 font-mono uppercase tracking-widest translate-y-[8px]">LVL</div>
                </div>

            </div>
        </div>
    );
}
