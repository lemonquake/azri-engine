import { RotateCcw, XCircle } from 'lucide-react';

interface GameOverScreenProps {
    onContinue: () => void;
    onQuit: () => void;
}

export function GameOverScreen({ onContinue, onQuit }: GameOverScreenProps) {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
            {/* Animated Background Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-red-950/80 via-transparent to-transparent opacity-80" />

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center space-y-8 p-10 bg-zinc-950/60 border border-red-900/40 rounded-3xl shadow-2xl backdrop-blur-md transform animate-in zoom-in-95 duration-700">

                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-800 drop-shadow-sm uppercase">
                        Game Over
                    </h1>
                    <p className="text-red-400/80 uppercase tracking-widest text-sm font-semibold">
                        You have met your demise.
                    </p>
                </div>

                {/* Buttons */}
                <div className="flex flex-col w-full gap-4 pt-4">
                    <button
                        onClick={onContinue}
                        className="group relative flex items-center justify-center gap-3 w-64 py-4 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold tracking-wide uppercase rounded-xl transition-all duration-300 overflow-hidden shadow-lg shadow-red-900/50 hover:scale-105 active:scale-95"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-red-400/0 via-white/20 to-red-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                        <RotateCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
                        <span>Continue</span>
                    </button>

                    <button
                        onClick={onQuit}
                        className="group flex items-center justify-center gap-3 w-64 py-4 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white font-bold tracking-wide uppercase rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <XCircle className="w-5 h-5 group-hover:text-red-400 transition-colors duration-300" />
                        <span>Quit Editor</span>
                    </button>
                </div>
            </div>

            {/* Decorative particles / vignette */}
            <div className="absolute inset-0 pointer-events-none" style={{
                boxShadow: 'inset 0 0 150px rgba(0,0,0,0.9)'
            }} />
        </div>
    );
}
