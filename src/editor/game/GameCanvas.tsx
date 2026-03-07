
import { useRef, useEffect, useState } from 'react';
import { GameRunner } from './GameRunner';
import { GameOverScreen } from './GameOverScreen';
import { PlayerHUD } from './PlayerHUD';

export function GameCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const runnerRef = useRef<GameRunner | null>(null);
    const [stats, setStats] = useState({ hp: 100, maxHp: 100, exp: 0, maxExp: 100, level: 1, wallJumps: 3, maxWallJumps: 3, wallFriction: 0 });

    // Game Over State
    const [isGameOver, setIsGameOver] = useState(false);
    const [runKey, setRunKey] = useState(0); // Used to force restart 

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (canvas) {
            canvas.focus();
        }

        // Initialize Game Runner
        runnerRef.current = new GameRunner(canvas);

        // Subscribe to stats
        runnerRef.current.onStatsChange = (newStats) => {
            setStats(newStats);
        };

        runnerRef.current.onGameOver = () => {
            setIsGameOver(true);
        };

        runnerRef.current.start();

        return () => {
            runnerRef.current?.stop();
            runnerRef.current = null;
        };
    }, [runKey]); // Will re-run setup and teardown when runKey changes

    return (
        <div className="relative w-full h-full overflow-hidden">
            <canvas
                ref={canvasRef}
                className="w-full h-full block touch-none focus:outline-none bg-[#1e1e2e]"
                tabIndex={0}
                onContextMenu={(e) => e.preventDefault()}
            />

            {/* --- Game Over Overlay --- */}
            {isGameOver && (
                <GameOverScreen
                    onContinue={() => {
                        setIsGameOver(false);
                        setRunKey(k => k + 1); // Triggers re-initialization
                    }}
                    onQuit={() => {
                        import('../../editor/state/editorStore').then(module => {
                            module.useEditorStore.getState().togglePlayMode();
                        });
                    }}
                />
            )}

            <PlayerHUD {...stats} />
        </div>
    );
}
