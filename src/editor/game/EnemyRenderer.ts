import type { CharacterAnimationState } from './DefaultCharacter';

export class EnemyRenderer {
    static render(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState) {
        ctx.save();

        const cx = enemy.x + enemy.width / 2;
        const cy = enemy.y + enemy.height / 2;
        ctx.translate(cx, cy);

        // Flip based on facing direction
        if (!enemy.facingRight) {
            ctx.scale(-1, 1);
        }

        const t = enemy.animationTimer;
        const state = enemy.state;
        const eType = enemy.enemyType || 'melee';

        // Hit flash logic
        if (state === 'hit') {
            ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
            ctx.globalCompositeOperation = 'lighter'; // Makes drawing extremely bright
        }

        // Delegate to specific render functions
        switch (eType) {
            case 'tank':
                this.renderTank(ctx, enemy, t, state);
                break;
            case 'flyer':
                this.renderFlyer(ctx, enemy, t, state);
                break;
            case 'assassin':
                this.renderAssassin(ctx, enemy, t, state);
                break;
            case 'shooter':
                this.renderShooter(ctx, enemy, t, state);
                break;
            case 'melee':
            default:
                this.renderMelee(ctx, enemy, t, state);
                break;
        }

        ctx.restore();
    }

    private static renderMelee(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState, t: number, state: string) {
        // Shadow Grunt (Base Melee) - sharp, angular, dark figure
        let scaleY = 1;
        let scaleX = 1;
        let rot = 0;
        let yOffset = 0;

        // Attack
        let armRot = Math.PI / 4;
        let armDist = 10;
        if (state.startsWith('attack')) {
            const p = Math.min(t * 10, 1);
            armRot = Math.PI / 4 - p * Math.PI; // Swipe down
            armDist = 10 + p * 15;
            rot = p * 0.2; // lean forward
        } else if (state === 'walk') {
            rot = 0.1;
            yOffset = Math.sin(t * 15) * 2;
            armRot = Math.sin(t * 15) * 0.5;
        } else if (state === 'idle') {
            yOffset = Math.sin(t * 3) * 1;
        }

        ctx.translate(0, yOffset);
        ctx.rotate(rot);
        ctx.scale(scaleX, scaleY);

        const w = enemy.width;
        const h = enemy.height;

        // Shadow Body (Jagged Polygon)
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#111';
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(w / 2 - 2, -h / 4);
        ctx.lineTo(w / 2 - 4, h / 4);
        ctx.lineTo(w / 4, h / 2 - 4);
        ctx.lineTo(0, h / 2);
        ctx.lineTo(-w / 4, h / 2 - 4);
        ctx.lineTo(-w / 2 + 4, h / 4);
        ctx.lineTo(-w / 2 + 2, -h / 4);
        ctx.closePath();
        ctx.fill();

        // Glowing Eyes
        ctx.fillStyle = state === 'hit' ? '#ff0000' : '#8b5cf6'; // Purple eyes
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        // Slanted angry eyes
        ctx.moveTo(w / 4, -h / 8);
        ctx.lineTo(w / 4 + 6, -h / 8 - 2);
        ctx.lineTo(w / 4 + 4, -h / 8 + 2);
        ctx.fill();

        // Arm/Claw
        ctx.save();
        ctx.translate(armDist, 0);
        ctx.rotate(armRot);
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#333';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(15, -2);
        ctx.lineTo(20, 0);
        ctx.lineTo(15, 2);
        ctx.fill();
        ctx.restore();
    }

    private static renderShooter(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState, t: number, state: string) {
        // Similar to Melee but with an energy cannon arm and different eye color
        let rot = 0;
        let yOffset = 0;

        let recoil = 0;
        if (state.startsWith('attack')) {
            // Charging and shooting
            if (t < 0.3) {
                rot = -0.1; // Lean back to charge
            } else {
                rot = 0.1; // recoil
                recoil = Math.max(0, 10 - (t - 0.3) * 50);
            }
        } else if (state === 'walk') {
            yOffset = Math.sin(t * 15) * 2;
        } else if (state === 'idle') {
            yOffset = Math.sin(t * 3) * 1;
        }

        ctx.translate(-recoil, yOffset);
        ctx.rotate(rot);

        const w = enemy.width;
        const h = enemy.height;

        // Base Body
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#1e1b4b'; // Deep indigo shadow
        ctx.beginPath();
        ctx.moveTo(0, -h / 2 + 4);
        ctx.lineTo(w / 2 - 2, 0);
        ctx.lineTo(0, h / 2);
        ctx.lineTo(-w / 2 + 2, 0);
        ctx.closePath();
        ctx.fill();

        // Eyes
        ctx.fillStyle = state === 'hit' ? '#ff0000' : '#f59e0b'; // Amber
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(w / 4, -h / 8, 3, 0, Math.PI * 2);
        ctx.fill();

        // Cannon Arm
        ctx.save();
        ctx.translate(w / 4, 0);
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#312e81';
        ctx.fillRect(0, -4, 18, 8);
        // glowing tip
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(20, 0, state.startsWith('attack') && t < 0.3 ? 6 + Math.random() * 4 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    private static renderTank(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState, t: number, state: string) {
        // Void Behemoth (Heavy, huge arms)
        let yOffset = 0;
        let rot = 0;
        let armLift = 0;
        let fistDown = 0;

        if (state.startsWith('attack')) {
            // Slow wind up, massive smash
            if (t < 0.6) {
                armLift = t * 40; // Raise arms high
                rot = -0.2 * (t / 0.6); // Lean back
            } else {
                let smashP = Math.min((t - 0.6) * 10, 1);
                armLift = 24 * (1 - smashP);
                fistDown = smashP * 30; // Smash into ground
                rot = 0.4 * smashP; // Lean forward into slam
            }
        } else if (state === 'walk') {
            // Lumbering, heavy steps
            yOffset = Math.abs(Math.sin(t * 8)) * -6; // heavy bounces
            rot = Math.sin(t * 4) * 0.1;
        }

        ctx.translate(0, yOffset);
        ctx.rotate(rot);

        const w = enemy.width;
        const h = enemy.height;
        const eColor = state === 'hit' ? '#ffffff' : '#2e1065'; // Very dark purple

        // Huge Body
        ctx.fillStyle = eColor;
        ctx.beginPath();
        ctx.roundRect(-w / 2 - 4, -h / 2 + 10, w + 8, h - 14, 8);
        ctx.fill();

        // Small Legs
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#000';
        ctx.fillRect(-w / 2 + 4, h / 2 - 10, 10, 10);
        ctx.fillRect(w / 2 - 14, h / 2 - 10, 10, 10);

        // Angry Glowing Eyes
        ctx.fillStyle = state === 'hit' ? '#ff0000' : '#10b981'; // Emerald glow
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 20;
        ctx.fillRect(w / 4 - 4, -h / 4, 12, 4);

        // Massive Arms
        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#4c1d95';
        ctx.shadowBlur = 0; // reset shadow for arms

        // Far arm
        ctx.save();
        ctx.translate(-w / 2, -armLift);
        ctx.beginPath();
        ctx.roundRect(-10, 0, 16, h / 2 + fistDown, 8);
        ctx.fill();
        ctx.restore();

        // Near arm
        ctx.save();
        ctx.translate(w / 2, -armLift);
        ctx.beginPath();
        ctx.roundRect(-6, 0, 20, h / 2 + fistDown + 4, 10);
        ctx.fill();
        ctx.restore();
    }

    private static renderFlyer(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState, t: number, state: string) {
        // Shadow Ray/Bat (Floating, flapping)
        // Constant hover
        let yOffset = Math.sin(t * 4 + enemy.x) * 8;
        let rot = 0;
        let wingFlap = Math.sin(t * 20) * 0.5; // Fast flap

        if (state.startsWith('attack')) {
            // Dive bomb!
            wingFlap = -0.5; // Wings tucked
            rot = 0.5; // Dive angle
            // Forward lunge simulated by adjusting x slightly if needed, but GameRunner handles actual velocity Let's just angle it.
        }

        ctx.translate(0, yOffset);
        ctx.rotate(rot);

        const w = enemy.width;
        const h = enemy.height;

        ctx.fillStyle = state === 'hit' ? '#ffffff' : '#0f172a'; // Slate dark

        // Body (kite shape)
        ctx.beginPath();
        ctx.moveTo(w / 2, 0); // nose
        ctx.lineTo(0, h / 2 - 4); // bottom
        ctx.lineTo(-w / 2 - 10, 0); // tail end
        ctx.lineTo(0, -h / 2 + 4); // top
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = state === 'hit' ? '#ff0000' : '#ef4444'; // Red eye
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(w / 4, -4, 3, 0, Math.PI * 2);
        ctx.fill();

        // Near Wing
        ctx.save();
        ctx.translate(0, -4);
        ctx.scale(1, 1 + wingFlap);
        ctx.fillStyle = state === 'hit' ? '#ffffff' : 'rgba(30, 41, 59, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-w / 4, 0);
        ctx.lineTo(-w / 2, -h / 2 - 10);
        ctx.lineTo(w / 4, 0);
        ctx.fill();
        ctx.restore();

        // Far Wing (behind)
        ctx.globalCompositeOperation = 'destination-over';
        ctx.save();
        ctx.translate(0, -4);
        ctx.scale(1, 1 - wingFlap); // Opposite phase visually
        ctx.fillStyle = state === 'hit' ? '#ffffff' : 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-w / 4, 0);
        ctx.lineTo(-10, -h / 2 - 8);
        ctx.lineTo(w / 4, 0);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    private static renderAssassin(ctx: CanvasRenderingContext2D, enemy: CharacterAnimationState, t: number, state: string) {
        // Nightstalker (Slender, scythe arms, fast blur)
        let yOffset = 0;
        let rot = 0;

        let scytheRot1 = 0;
        let scytheRot2 = 0;

        if (state === 'walk') {
            // Naruto-run lean
            rot = 0.4;
            yOffset = Math.sin(t * 30) * 2; // Very fast step bob
            scytheRot1 = -0.5; // trailing arms
            scytheRot2 = -0.6;
        } else if (state.startsWith('attack')) {
            // Flurry slash
            rot = 0.1;
            const p = Math.sin(t * 30); // frantic swinging
            scytheRot1 = p * Math.PI / 2;
            scytheRot2 = -p * Math.PI / 2;
        } else {
            // Idle
            yOffset = Math.sin(t * 6) * 1;
            scytheRot1 = Math.sin(t * 2) * 0.1;
            scytheRot2 = Math.cos(t * 2) * 0.1;
        }

        ctx.translate(0, yOffset);
        ctx.rotate(rot);

        const h = enemy.height;
        const hitColor = state === 'hit' ? '#ffffff' : null;

        // Tall slender body
        ctx.fillStyle = hitColor || '#09090b'; // Black/Zinc 950
        ctx.beginPath();
        // Slender curve
        ctx.moveTo(-4, -h / 2);
        ctx.quadraticCurveTo(8, 0, -4, h / 2);
        ctx.lineTo(-8, h / 2);
        ctx.quadraticCurveTo(0, 0, -8, -h / 2);
        ctx.closePath();
        ctx.fill();

        // 4 Glowing eyes vertically arranged
        ctx.fillStyle = hitColor || '#06b6d4'; // Cyan
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(2, -h / 2 + 6 + i * 5, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Scythe Arm 1 (Far)
        ctx.globalCompositeOperation = 'destination-over';
        ctx.save();
        ctx.translate(0, -h / 4);
        ctx.rotate(scytheRot2);
        ctx.fillStyle = hitColor || '#27272a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, 10);
        ctx.lineTo(24, -10); // Blade tip
        ctx.lineTo(10, 8);
        ctx.closePath();
        ctx.fill();
        // Plasma edge
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.moveTo(12, 10);
        ctx.lineTo(24, -10);
        ctx.lineTo(22, -10);
        ctx.lineTo(11, 8);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';

        // Scythe Arm 2 (Near)
        ctx.save();
        ctx.translate(2, 0);
        ctx.rotate(scytheRot1);
        ctx.fillStyle = hitColor || '#18181b';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(16, -5);
        ctx.lineTo(28, 15); // Blade tip
        ctx.lineTo(14, -3);
        ctx.closePath();
        ctx.fill();
        // Plasma edge near
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.moveTo(16, -5);
        ctx.lineTo(28, 15);
        ctx.lineTo(26, 15);
        ctx.lineTo(15, -3);
        ctx.fill();
        ctx.restore();
    }
}
