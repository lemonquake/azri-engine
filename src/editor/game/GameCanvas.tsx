
import { useRef, useEffect, useState } from 'react';
import { GameRunner } from './GameRunner';
import { GameOverScreen } from './GameOverScreen';
import { PlayerHUD } from './PlayerHUD';

export function GameCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const runnerRef = useRef<GameRunner | null>(null);
    const [stats, setStats] = useState({ hp: 100, maxHp: 100, exp: 0, maxExp: 100, level: 1, wallJumps: 3, maxWallJumps: 3, wallFriction: 0 });

    // Game Over State
    const [isGameOver, setIsGameOver] = useState(false);
    const [runKey, setRunKey] = useState(0); // Used to force restart 

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Initialize Game Runner
        runnerRef.current = new GameRunner(container);

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
        <div 
            ref={containerRef}
            className="relative w-full h-full overflow-hidden bg-[#1e1e2e]"
            tabIndex={0}
        >

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
