import anime from 'animejs';

export interface GameTweenConfig extends anime.AnimeParams {
    targets?: any;
    id?: string;
    [key: string]: any;
}

export class GameTween {
    public anim: anime.AnimeInstance;
    public elapsed: number = 0;
    public isFinished: boolean = false;
    public id?: string;

    constructor(config: GameTweenConfig) {
        this.id = config.id;
        this.anim = anime({
            ...config,
            autoplay: false
        });
    }

    public tick(dtMs: number) {
        if (this.isFinished) return;
        this.elapsed += dtMs;
        this.anim.tick(this.elapsed);
        if (this.anim.completed) {
            this.isFinished = true;
        }
    }

    public stop() {
        this.isFinished = true;
        this.anim.pause();
    }
}

export class AnimationSystem {
    private static activeTweens: GameTween[] = [];

    /**
     * Start a new animation that is ticked manually by the game loop.
     */
    public static add(config: GameTweenConfig): GameTween {
        // If an ID is provided, cancel existing tweens with the same ID
        if (config.id) {
            this.cancel(config.id);
        }

        const tween = new GameTween(config);
        this.activeTweens.push(tween);
        return tween;
    }

    /**
     * Cancel an animation by its ID
     */
    public static cancel(id: string) {
        this.activeTweens = this.activeTweens.filter(t => {
            if (t.id === id) {
                t.stop();
                return false;
            }
            return true;
        });
    }

    /**
     * Cancel all active tweens on a specific target
     */
    public static cancelTarget(target: any) {
        this.activeTweens = this.activeTweens.filter(t => {
            // Anime.js stores targets in anim.animatables
            const targets = t.anim.animatables.map((a: any) => a.target);
            if (targets.includes(target)) {
                t.stop();
                return false;
            }
            return true;
        });
    }

    /**
     * Tick all active animations. Must be called in the game loop.
     * @param dt Delta time in seconds
     */
    public static update(dt: number) {
        const dtMs = dt * 1000;
        for (let i = this.activeTweens.length - 1; i >= 0; i--) {
            const tween = this.activeTweens[i];
            tween.tick(dtMs);
            if (tween.isFinished) {
                this.activeTweens.splice(i, 1);
            }
        }
    }

    /**
     * Clear all animations globally
     */
    public static clearAll() {
        for (const tween of this.activeTweens) {
            tween.stop();
        }
        this.activeTweens = [];
    }
}
