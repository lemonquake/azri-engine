export interface CharacterAnimationState {
    x: number;
    y: number;
    width: number;
    height: number;
    velocityX: number;
    velocityY: number;
    isGrounded: boolean;
    facingRight: boolean;
    state: 'idle' | 'walk' | 'jump' | 'freefall' | 'crouch' | 'attack1' | 'attack2' | 'attack3' | 'hit' | string;
    animationTimer: number;
    // Stats
    hp: number;
    maxHp: number;
    exp: number;
    maxExp: number;
    level: number;
    isEnemy?: boolean;
    enemyType?: 'melee' | 'shooter' | 'tank' | 'flyer' | 'assassin';
    enemyBehavior?: 'standing' | 'pingpong' | 'follow';
    startX?: number;
    attackCooldown?: number;
    dead?: boolean;
    // Polish & Combat Overhaul
    hitStunTimer?: number;
    hitStunDuration?: number;
    comboVariant?: number; // 1, 2, or 3
    comboStep?: number;
    isAirCombo?: boolean;
    hitIntensity?: 'light' | 'medium' | 'heavy';
    // Multiplayer
    playerIndex?: number;
    username?: string;
    // Gameplay Polish Mechanics
    airAttackCount?: number;
    jumpCount?: number;
    maxJumps?: number;
    dashCooldownTimer?: number;
    dashDurationTimer?: number;
    isDashing?: boolean;
    isOnWall?: boolean;
    wallSlideTimer?: number;
    wallDirection?: number;
    wallJumpCount?: number;
    isSlamming?: boolean;
    exhaustedWallJumpTimer?: number;
    wallFriction?: number; // 0 to 100
    isOverheated?: boolean;
    bounceCancelWindowTimer?: number;
    // Visual Effects
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    dashTrail?: Array<{ x: number, y: number, facingRight: boolean, state: string, opacity: number, rotation: number, tint?: string }>;
}

export class DefaultCharacter {
    static render(ctx: CanvasRenderingContext2D, char: CharacterAnimationState) {
        // --- Dash Trail Render (Drawn behind the character) ---
        if (char.dashTrail && char.dashTrail.length > 0) {
            char.dashTrail.forEach(trailPos => {
                ctx.save();
                ctx.translate(Math.floor(trailPos.x), Math.floor(trailPos.y));

                const trailCx = char.width / 2;
                const trailCy = char.height / 2;
                ctx.translate(trailCx, trailCy);

                if (trailPos.rotation) {
                    ctx.rotate(trailPos.rotation * Math.PI / 180);
                }

                if (!trailPos.facingRight) {
                    ctx.scale(-1, 1);
                }

                ctx.globalAlpha = trailPos.opacity;

                // Draw Ghostly Silhouette (Plum Shape)
                ctx.fillStyle = trailPos.tint || '#0ea5e9'; // fallback sky-500 tint
                ctx.beginPath();
                ctx.moveTo(-char.width / 2 + 2, -char.height / 2 + 4);
                ctx.bezierCurveTo(-char.width / 2 - 4, char.height / 2, char.width / 2 + 4, char.height / 2, char.width / 2 - 2, -char.height / 2 + 4);
                ctx.bezierCurveTo(char.width / 2, -char.height / 2 - 8, -char.width / 2, -char.height / 2 - 8, -char.width / 2 + 2, -char.height / 2 + 4);
                ctx.fill();

                ctx.restore();
            });
        }

        // --- Draw Main Character ---
        ctx.save();

        const cx = char.x + char.width / 2;
        const cy = char.y + char.height / 2;
        ctx.translate(cx, cy);

        // --- Render Player Nameplate (Drawn before rotation/flipping) ---
        if (char.username) {
            ctx.save();
            // Position above the character's head
            ctx.translate(0, -char.height / 2 - 20);

            const nameText = char.username.toUpperCase();

            // User requested bigger text (14px) and no background
            ctx.font = 'bold 14px "VT323", monospace, "Press Start 2P", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Text stroke for readability since there is no background
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.strokeText(nameText, 0, 0);

            // Player Color logic
            ctx.fillStyle = char.playerIndex === 2 ? '#a855f7' : char.playerIndex === 3 ? '#fbbf24' : '#818cf8';
            if (char.isEnemy) ctx.fillStyle = '#ef4444';

            ctx.fillText(nameText, 0, 0);
            ctx.restore();
        }

        // --- Core Animation Variables ---
        const t = char.animationTimer;
        // Deterimine if braking (Idle but sliding fast horizontally)
        const isBraking = char.state === 'idle' && Math.abs(char.velocityX) > 10;

        let visualScaleX = char.scaleX ?? 1;
        let visualScaleY = char.scaleY ?? 1;

        let visualRotation = char.rotation || 0;

        // Apply visual rotation from game runner (used for flip)
        if (visualRotation) {
            ctx.rotate(visualRotation * Math.PI / 180);
        }

        // --- Dash Stretch ---
        if (char.isDashing) {
            visualScaleX *= 1.4;
            visualScaleY *= 0.6;
        }

        // Apply visual squash/stretch
        if (visualScaleX !== 1 || visualScaleY !== 1) {
            ctx.scale(visualScaleX, visualScaleY);
        }

        // Flip if facing left
        if (!char.facingRight) {
            ctx.scale(-1, 1);
        }

        // Colors (Cute & Deadly Aesthetic -> Sleek Red & Black)
        let bodyColor = char.isEnemy ? '#3b1c1c' : '#111111'; // Darker for player
        let visorColor = '#000000'; // Pure black
        let eyeColor = char.isEnemy ? '#f59e0b' : '#ff1111'; // Red eyes for player, amber for enemy
        let scarfColor = char.isEnemy ? '#444444' : '#aa0000'; // Dark red scarf for player
        let limbColor = '#222222'; // Dark Gray

        // Multiplayer Visual Identity Hooks
        if (char.playerIndex === 2) {
            // Shadow Ninja (P2)
            bodyColor = '#2d1b4e';
            eyeColor = '#9333ea';
            scarfColor = '#581c87';
        } else if (char.playerIndex === 3) {
            // Heavy Golem (P3)
            bodyColor = '#3f3f46';
            eyeColor = '#eab308';
            scarfColor = '#71717a';
        }

        let daggerColor = char.playerIndex === 2 ? '#a855f7' : char.playerIndex === 3 ? '#fbbf24' : '#ff2222';
        let daggerGlow = 10 + Math.sin(t * 15) * 5; // Pulsing

        // Hit flash & shake (Intensity based)
        let hitShakeX = 0;
        let hitShakeY = 0;

        if (char.state === 'hit') {
            const intensity = char.hitIntensity || 'light';

            // White out based on hit stun remaining (brighter at start)
            let flashStrength = 1.0;
            if (char.hitStunDuration && char.hitStunDuration > 0 && char.hitStunTimer) {
                flashStrength = char.hitStunTimer / char.hitStunDuration;
            }

            if (flashStrength > 0.5) {
                bodyColor = '#ffffff';
                visorColor = '#ffffff';
                scarfColor = '#ffffff';
                limbColor = '#ffffff';
                eyeColor = '#ff0000';
            }

            // Shake severity based on intensity
            let shakeMult = 2;
            if (intensity === 'medium') shakeMult = 4;
            if (intensity === 'heavy') shakeMult = 8;

            if (flashStrength > 0.2) {
                hitShakeX = (Math.random() - 0.5) * shakeMult;
                hitShakeY = (Math.random() - 0.5) * shakeMult;
            }
            ctx.translate(hitShakeX, hitShakeY);

            // Squash on heavy hits
            if (intensity === 'heavy') {
                ctx.scale(1.2, 0.8);
            }
        }

        // --- Body Parts Setup ---
        let bodyYOffset = 0;
        let bodyRot = 0;

        let footL = { x: -6, y: char.height / 2 + 4, rot: 0, scale: 1 };
        let footR = { x: 6, y: char.height / 2 + 4, rot: 0, scale: 1 };

        let handL = { x: -12, y: 0, rot: 0, scale: 1 };
        let handR = { x: 12, y: 0, rot: 0, scale: 1 };

        let scarfWave = Math.sin(t * 10) * 5;
        let scarfTrail = -15;

        // --- Animation State Machine ---
        if (char.isSlamming) {
            // Ground Slamma Jamma: Rigid dive, glowing hands over head
            bodyYOffset = -4;
            bodyRot = 0;

            // Hands super high above head, clasped
            handL = { x: -4, y: -char.height / 2 - 10, rot: -Math.PI / 4, scale: 1.5 };
            handR = { x: 4, y: -char.height / 2 - 10, rot: Math.PI / 4, scale: 1.5 };

            // Feet pointing up
            footL = { x: -8, y: -char.height / 4, rot: 0, scale: 1 };
            footR = { x: 8, y: -char.height / 4, rot: 0, scale: 1 };

            // Scarf blowing straight up
            scarfTrail = 0;
            scarfWave = -25;

            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 20;

        } else if (char.exhaustedWallJumpTimer && char.exhaustedWallJumpTimer > 0) {
            // Wall Jump Max (Flailing / Exhausted)
            bodyRot = Math.sin(t * 40) * 0.2; // frantic shaking
            handL = { x: -15, y: -10 + Math.sin(t * 50) * 5, rot: 0, scale: 1.2 };
            handR = { x: 15, y: -10 + Math.cos(t * 50) * 5, rot: 0, scale: 1.2 };
            footL = { x: -10, y: char.height / 2 + Math.cos(t * 40) * 5, rot: 0, scale: 1 };
            footR = { x: 10, y: char.height / 2 + Math.sin(t * 40) * 5, rot: 0, scale: 1 };

        } else if (char.isOnWall) {
            // Clinging to Wall
            // Wall is always visually in "front" (Right) because of X-scaling flip based on facingRight
            bodyRot = 0.2; // lean away from wall

            handR = { x: 10, y: -char.height / 4, rot: 0, scale: 1 }; // High grip against wall
            handL = { x: 10, y: 0, rot: 0, scale: 1 }; // Low grip against wall

            footR = { x: 8, y: char.height / 2, rot: -Math.PI / 6, scale: 1 }; // Braced against wall
            footL = { x: -4, y: char.height / 2 + 4, rot: Math.PI / 6, scale: 1 }; // Hanging freely

            bodyYOffset = Math.sin(t * 10) * 1; // Subtle struggle

            if (char.isOverheated) {
                // Frantic sliding down hot wall
                handR.y += Math.sin(t * 50) * 2;
                handL.y += Math.cos(t * 50) * 2;
                ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // Hot glow
            }

            scarfWave = Math.sin(t * 20) * 3;
            scarfTrail = -10 - char.velocityY * 0.05; // Fly up if sliding fast

        } else if (char.isDashing) {
            // Dash - Spear pose
            bodyRot = Math.PI / 6; // Lean into the dash
            handL = { x: 18, y: 5, rot: 0, scale: 1.2 }; // Reach forward
            handR = { x: 18, y: -5, rot: 0, scale: 1.2 };
            footL = { x: -10, y: char.height / 2, rot: Math.PI / 4, scale: 1 }; // Trail back
            footR = { x: -15, y: char.height / 2 - 5, rot: Math.PI / 4, scale: 1 };

            scarfWave = Math.sin(t * 50) * 2;
            scarfTrail = -25;

        } else if (char.state === 'jump') {
            // Jump or Fall
            bodyYOffset = 0;
            if (char.velocityY < 0) {
                // Rising / Reaching Up
                bodyRot = -0.1;
                handL = { x: -10, y: -char.height / 2, rot: 0, scale: 1 };
                handR = { x: 10, y: -char.height / 2 - 5, rot: 0, scale: 1.1 };
                footL = { x: -5, y: char.height / 2 + 2, rot: Math.PI / 8, scale: 1 };
                footR = { x: 5, y: char.height / 2 + 6, rot: Math.PI / 4, scale: 1 };
                scarfTrail = -10;
                scarfWave = 15; // blowing downward
            } else {
                // Falling / Flailing slightly
                bodyRot = 0.1;
                handL = { x: -12, y: -10, rot: 0, scale: 1 };
                handR = { x: 12, y: -15, rot: 0, scale: 1 };
                footL = { x: -6, y: char.height / 2 - 2, rot: -Math.PI / 8, scale: 1 };
                footR = { x: 6, y: char.height / 2 - 4, rot: -Math.PI / 6, scale: 1 };
                scarfTrail = -10;
                scarfWave = -15; // blowing upward
            }
            // Double jump flip relies on context.rotate from earlier

        } else if (char.state === 'freefall') {
            // Uncontrolled / Exhausted Fall
            bodyRot = Math.sin(t * 10) * 0.1; // Slight helpless wiggle
            bodyYOffset = -2;
            handL = { x: -15, y: -20, rot: -Math.PI / 4, scale: 1 }; // Arms flailing up
            handR = { x: 15, y: -25, rot: Math.PI / 4, scale: 1 };
            footL = { x: -8, y: char.height / 2 - 8, rot: 0, scale: 1 }; // Legs hanging limp
            footR = { x: 8, y: char.height / 2 - 6, rot: 0, scale: 1 };
            scarfTrail = 0;
            scarfWave = -20; // Scarf blowing straight up

        } else if (isBraking) {
            // Braking (Leaning back, heels dug in)
            bodyRot = -Math.PI / 8;
            bodyYOffset = 2; // Squish down
            handL = { x: 14, y: 0, rot: Math.PI / 4, scale: 1.2 }; // Pressing forward
            handR = { x: 16, y: -2, rot: Math.PI / 4, scale: 1.2 };
            footL = { x: 10, y: char.height / 2, rot: -Math.PI / 6, scale: 1 }; // Heels forward
            footR = { x: 14, y: char.height / 2 - 2, rot: -Math.PI / 4, scale: 1 };

            scarfTrail = 15; // Scarf snaps forward!
            scarfWave = Math.sin(t * 15) * 5;

        } else if (char.state === 'crouch') {
            // Squished Crouch
            bodyYOffset = char.height / 2 - 5;
            bodyRot = 0;
            handL = { x: -8, y: 8, rot: 0, scale: 1 };
            handR = { x: 8, y: 8, rot: 0, scale: 1 };
            footL = { x: -6, y: char.height / 2, rot: 0, scale: 1 };
            footR = { x: 6, y: char.height / 2, rot: 0, scale: 1 };
            scarfTrail = -8;
            scarfWave = Math.sin(t * 5) * 2;

        } else if (char.state === 'walk') {
            // Walk cycle (Cycloid motion for feet)
            const walkSpeed = 20; // more fluid and fast
            const cyclePhase = (t * walkSpeed) % (Math.PI * 2);

            bodyYOffset = Math.abs(Math.sin(cyclePhase)) * -4; // Bob up and down more fluidly
            bodyRot = 0.15; // Lean into walk more

            // Feet circular pumping, smoother
            footL = {
                x: Math.cos(cyclePhase) * -10,
                y: char.height / 2 + Math.max(0, Math.sin(cyclePhase)) * -10,
                rot: Math.cos(cyclePhase) * 0.5, scale: 1
            };
            footR = {
                x: Math.cos(cyclePhase + Math.PI) * -10,
                y: char.height / 2 + Math.max(0, Math.sin(cyclePhase + Math.PI)) * -10,
                rot: Math.cos(cyclePhase + Math.PI) * 0.5, scale: 1
            };

            // Arm swing opposite to feet (slight dagger forward)
            handL = { x: Math.cos(cyclePhase + Math.PI) * 12, y: 4, rot: Math.PI / 4, scale: 1 };
            handR = { x: Math.cos(cyclePhase) * 12, y: 4, rot: Math.PI / 4, scale: 1 };

            scarfTrail = -22;
            scarfWave = Math.sin(t * 25) * 6;

        } else if (char.state.startsWith('attack')) {
            const step = parseInt(char.state.slice(-1)) || 1;
            const progress = Math.min((t * 15), 1); // Clamp or wrap depending on desired feel

            if (char.state.startsWith('attack_base_')) {
                if (step === 1) {
                    // Fast slash right
                    bodyRot = 0.2; bodyYOffset = 2;
                    handR = { x: 10 + Math.sin(progress * Math.PI) * 20, y: 0 - Math.sin(progress * Math.PI) * 10, rot: Math.PI / 2 + progress * Math.PI, scale: 1.4 };
                    handL = { x: -5, y: 5, rot: -Math.PI / 4, scale: 1 };
                    footL = { x: -8, y: char.height / 2, rot: 0, scale: 1 }; footR = { x: 12, y: char.height / 2, rot: -0.2, scale: 1 };
                    scarfTrail = -15; scarfWave = 10;
                } else if (step === 2) {
                    // Fast slash left
                    bodyRot = -0.1; bodyYOffset = 2;
                    handL = { x: 10 + Math.sin(progress * Math.PI) * 20, y: 5 - Math.sin(progress * Math.PI) * 10, rot: Math.PI / 2 - progress * Math.PI, scale: 1.4 };
                    handR = { x: -10, y: 0, rot: Math.PI / 4, scale: 1 };
                    footL = { x: -5, y: char.height / 2, rot: -0.2, scale: 1 }; footR = { x: 10, y: char.height / 2, rot: 0, scale: 1 };
                    scarfTrail = 10; scarfWave = 15;
                } else {
                    // Heavy Thrust
                    bodyRot = 0.4; bodyYOffset = 4;
                    handR = { x: 10 + progress * 25, y: -5 + progress * 10, rot: Math.PI / 2, scale: 1.8 };
                    handL = { x: 5 + progress * 20, y: 5 + progress * 10, rot: Math.PI / 2, scale: 1.6 };
                    footL = { x: -12, y: char.height / 2 + 2, rot: 0.2, scale: 1 }; footR = { x: 18, y: char.height / 2 - 2, rot: -0.2, scale: 1 };
                    scarfTrail = -25; scarfWave = 0;
                }
            } else if (char.state.startsWith('attack_up_')) {
                if (step === 1) {
                    // Upward rising slash
                    bodyRot = -0.3; bodyYOffset = -2;
                    handR = { x: 8 + progress * 10, y: -10 - progress * 20, rot: Math.PI + progress * Math.PI / 2, scale: 1.5 };
                    handL = { x: -5, y: -5, rot: -Math.PI / 2, scale: 1 };
                    footL = { x: -5, y: char.height / 2 + 5, rot: Math.PI / 8, scale: 1 }; footR = { x: 5, y: char.height / 2 + 10, rot: Math.PI / 6, scale: 1 };
                    scarfTrail = -5; scarfWave = 20;
                } else if (step === 2) {
                    // Dual daggers up
                    bodyRot = -0.4; bodyYOffset = -4;
                    handR = { x: 5 + progress * 5, y: -15 - progress * 15, rot: Math.PI * 1.2, scale: 1.6 };
                    handL = { x: 15 + progress * 5, y: -10 - progress * 15, rot: Math.PI * 1.4, scale: 1.6 };
                    footL = { x: -8, y: char.height / 2 + 2, rot: 0, scale: 1 }; footR = { x: 8, y: char.height / 2 + 8, rot: Math.PI / 4, scale: 1 };
                    scarfTrail = -10; scarfWave = 25;
                } else {
                    // Spiral uppercut
                    bodyRot = progress * Math.PI * 4; // SPIN!
                    bodyYOffset = -10 - progress * 10;
                    handR = { x: 15, y: 0, rot: Math.PI / 2, scale: 1.8 };
                    handL = { x: -15, y: 0, rot: -Math.PI / 2, scale: 1.8 };
                    footL = { x: -10, y: char.height / 2, rot: 0, scale: 1 }; footR = { x: 10, y: char.height / 2, rot: 0, scale: 1 };
                    scarfTrail = 0; scarfWave = 30;
                }
            } else if (char.state.startsWith('attack_down_')) {
                if (step === 1) {
                    // Low sweep
                    bodyRot = 0.5; bodyYOffset = 8;
                    handR = { x: 15 + progress * 10, y: char.height / 2 - 5, rot: -Math.PI / 4 + progress * Math.PI / 2, scale: 1.5 };
                    handL = { x: -10, y: 5, rot: -Math.PI / 2, scale: 1 };
                    footL = { x: -12, y: char.height / 2, rot: 0.2, scale: 1 }; footR = { x: 12, y: char.height / 2, rot: -0.2, scale: 1 };
                    scarfTrail = -20; scarfWave = 5;
                } else if (step === 2) {
                    // Downward stab
                    bodyRot = 0.6; bodyYOffset = 10;
                    handL = { x: 15, y: char.height / 2, rot: 0, scale: 1.5 };
                    handR = { x: 20, y: char.height / 2 - 5, rot: Math.PI / 8, scale: 1.5 };
                    footL = { x: -15, y: char.height / 2 - 2, rot: 0.3, scale: 1 }; footR = { x: 8, y: char.height / 2, rot: -0.1, scale: 1 };
                    scarfTrail = -25; scarfWave = 2;
                } else {
                    // Double downward smash
                    bodyRot = 0.8; bodyYOffset = 12;
                    handR = { x: 10 + progress * 15, y: char.height / 2 + progress * 5, rot: Math.PI / 4, scale: 1.8 };
                    handL = { x: 2 + progress * 15, y: char.height / 2 + 5 + progress * 5, rot: Math.PI / 4, scale: 1.8 };
                    footL = { x: -12, y: char.height / 2 + 2, rot: 0.2, scale: 1 }; footR = { x: -2, y: char.height / 2 - 5, rot: 0.5, scale: 1 };
                    scarfTrail = -30; scarfWave = 0;
                }
            } else if (char.state.startsWith('attack_air_base_')) {
                if (step === 1) {
                    // Mid-air spin slash
                    bodyRot = progress * Math.PI * 4;
                    bodyYOffset = 0;
                    handR = { x: 15, y: 0, rot: Math.PI / 2, scale: 1.5 };
                    handL = { x: -15, y: 0, rot: -Math.PI / 2, scale: 1.5 };
                    footL = { x: -8, y: char.height / 2, rot: Math.PI / 4, scale: 1 };
                    footR = { x: 8, y: char.height / 2, rot: Math.PI / 3, scale: 1 };
                    scarfTrail = 0; scarfWave = 20;
                } else if (step === 2) {
                    // Cross cut
                    bodyRot = 0.2; bodyYOffset = 0;
                    handR = { x: 15 - progress * 20, y: -5 + progress * 10, rot: -Math.PI / 4, scale: 1.5 };
                    handL = { x: 5 + progress * 20, y: -5 + progress * 10, rot: Math.PI / 4, scale: 1.5 };
                    footL = { x: -10, y: char.height / 2, rot: 0.1, scale: 1 };
                    footR = { x: 5, y: char.height / 2 + 5, rot: 0.5, scale: 1 };
                    scarfTrail = -15; scarfWave = 10;
                } else {
                    // Diving thrust finisher
                    bodyRot = Math.PI / 4; bodyYOffset = 5;
                    handR = { x: 15, y: 15, rot: Math.PI / 4, scale: 1.8 };
                    handL = { x: 5, y: 5, rot: Math.PI / 4, scale: 1.6 };
                    footL = { x: -15, y: char.height / 2 - 5, rot: 0, scale: 1 };
                    footR = { x: -5, y: char.height / 2 - 10, rot: 0, scale: 1 };
                    scarfTrail = -25; scarfWave = -10;
                }
            } else if (char.state.startsWith('attack_air_up_')) {
                if (step === 1) {
                    // Aerial rising slash
                    bodyRot = -0.2; bodyYOffset = -5;
                    handR = { x: 10, y: -15 - progress * 10, rot: Math.PI, scale: 1.5 };
                    handL = { x: -5, y: -5, rot: -Math.PI / 4, scale: 1 };
                    footL = { x: -5, y: char.height / 2 + 5, rot: 0.2, scale: 1 };
                    footR = { x: 8, y: char.height / 2 + 10, rot: 0.5, scale: 1 };
                    scarfTrail = -5; scarfWave = 20;
                } else if (step === 2) {
                    // Helicopter spin
                    bodyRot = progress * Math.PI * 6; // Fast spin
                    bodyYOffset = -8;
                    handR = { x: 18, y: -5, rot: Math.PI / 2, scale: 1.5 };
                    handL = { x: -18, y: -5, rot: -Math.PI / 2, scale: 1.5 };
                    footL = { x: -5, y: char.height / 2, rot: 0.2, scale: 1 };
                    footR = { x: 5, y: char.height / 2, rot: 0.2, scale: 1 };
                    scarfTrail = 0; scarfWave = 25;
                } else {
                    // Sky breaker split
                    bodyRot = 0; bodyYOffset = -12;
                    handR = { x: 20, y: -10, rot: Math.PI / 4, scale: 1.8 };
                    handL = { x: -20, y: -10, rot: -Math.PI / 4, scale: 1.8 };
                    footL = { x: -15, y: char.height / 2, rot: -0.5, scale: 1 };
                    footR = { x: 15, y: char.height / 2, rot: 0.5, scale: 1 };
                    scarfTrail = 0; scarfWave = 30;
                }
            } else if (char.state.startsWith('attack_air_down_')) {
                if (step === 1) {
                    // Downward diagonal slash
                    bodyRot = 0.4; bodyYOffset = 5;
                    handR = { x: 15, y: 15, rot: 0, scale: 1.5 };
                    handL = { x: 0, y: 5, rot: -Math.PI / 4, scale: 1 };
                    footL = { x: -10, y: char.height / 2, rot: 0, scale: 1 };
                    footR = { x: 5, y: char.height / 2 - 5, rot: 0, scale: 1 };
                    scarfTrail = -20; scarfWave = 0;
                } else {
                    // Meteor dive
                    bodyRot = Math.PI / 2; bodyYOffset = 15;
                    handR = { x: 0, y: 25, rot: 0, scale: 2.0 };
                    handL = { x: 0, y: 15, rot: 0, scale: 2.0 };
                    footL = { x: -15, y: 0, rot: 0, scale: 1 };
                    footR = { x: -15, y: 10, rot: 0, scale: 1 };
                    scarfTrail = -30; scarfWave = -10;
                }
            }
        } else if (char.state === 'hit') {
            let hitProgress = 1.0;
            if (char.hitStunDuration && char.hitStunDuration > 0 && char.hitStunTimer) {
                // 1.0 is start of hit (max stun time), 0.0 is end of hit
                hitProgress = char.hitStunTimer / char.hitStunDuration;
            } else {
                // Decay based on animation timer for player/old logic fallback
                hitProgress = Math.max(0, 1.0 - (t / 0.4));
            }

            // Phase 1: Violet backward snap (hitProgress 0.7 - 1.0)
            // Phase 2: Shaking hold (hitProgress 0.3 - 0.7)
            // Phase 3: Recovery (hitProgress 0.0 - 0.3)

            if (hitProgress > 0.7) {
                // Whip back
                bodyRot = -0.6 * (hitProgress);
                bodyYOffset = -4;
                handL = { x: -20, y: -15, rot: -Math.PI / 2, scale: 1.2 };
                handR = { x: -10, y: -20, rot: -Math.PI / 2, scale: 1.2 };
                footL = { x: 15, y: char.height / 2 - 8, rot: -0.8, scale: 1 };
                footR = { x: 5, y: char.height / 2 - 2, rot: -0.4, scale: 1 };
                scarfTrail = 25; scarfWave = -15;
            } else {
                // Recovery/Hold
                bodyRot = -0.3 * (hitProgress / 0.7);
                bodyYOffset = -2;
                handL = { x: -15, y: -10, rot: -Math.PI / 4, scale: 1 };
                handR = { x: -5, y: -10, rot: -Math.PI / 4, scale: 1 };
                footL = { x: 10, y: char.height / 2 - 5, rot: -0.5, scale: 1 };
                footR = { x: -2, y: char.height / 2, rot: 0, scale: 1 };
                scarfTrail = 15; scarfWave = -5;
            }
        } else {
            // 3 Idle Animations - Cycle every ~4 seconds
            const idleCycle = Math.floor(t / 4) % 3;

            if (idleCycle === 0) {
                // Idle 1: Fluid breathing
                bodyYOffset = Math.sin(t * 2) * 2; // Deeper breathing
                bodyRot = Math.sin(t * 1) * 0.05;
                handL = { x: -10 - Math.sin(t * 2) * 1, y: 6 + Math.sin(t * 2) * 1, rot: Math.PI / 8, scale: 1 }; // holding dagger at rest
                handR = { x: 10 + Math.sin(t * 2) * 1, y: 6 + Math.sin(t * 2) * 1, rot: -Math.PI / 8, scale: 1 };
            } else if (idleCycle === 1) {
                // Idle 2: Looking around sharp
                bodyYOffset = Math.sin(t * 2) * 0.5;
                bodyRot = Math.sin(t * 3) > 0 ? 0.15 : -0.15; // Snappy look
                const lookDist = Math.sin(t * 3) * 4;
                handL = { x: -8 + lookDist, y: 4, rot: Math.PI / 6, scale: 1 };
                handR = { x: 12 + lookDist, y: 4, rot: 0, scale: 1 };
            } else {
                // Idle 3: Stretching / Combat ready
                bodyYOffset = Math.sin(t * 5) * 2;
                bodyRot = 0.1; // lean forward playfully
                handL = { x: 10 + Math.sin(t * 10) * 2, y: -2 + Math.cos(t * 10) * 2, rot: 0, scale: 1 }; // High fist
                handR = { x: 4 + Math.cos(t * 10) * 2, y: 4 + Math.sin(t * 10) * 2, rot: 0, scale: 1 }; // Low fist
            }

            footL = { x: -5, y: char.height / 2, rot: 0, scale: 1 };
            footR = { x: 5, y: char.height / 2, rot: 0, scale: 1 };
            scarfTrail = -8;
            scarfWave = Math.sin(t * 4) * 3;
        }

        // --- Execute Render ---
        ctx.translate(0, bodyYOffset);

        // Draw Scarf (Background Layer)
        ctx.fillStyle = scarfColor;
        ctx.beginPath();
        const scarfBaseX = -4;
        const scarfBaseY = -6;
        ctx.moveTo(scarfBaseX, scarfBaseY);
        const scarfEndX = scarfBaseX + scarfTrail;
        const scarfEndY = scarfBaseY + scarfWave;
        ctx.quadraticCurveTo(scarfBaseX + scarfTrail / 2, scarfBaseY - 10, scarfEndX, scarfEndY);
        ctx.quadraticCurveTo(scarfBaseX + scarfTrail / 2, scarfBaseY + 5, scarfBaseX, scarfBaseY + 6);
        ctx.fill();

        // Rotate Body Context
        ctx.save();
        ctx.rotate(bodyRot);

        const drawLimb = (limb: { x: number, y: number, rot: number, scale: number }, isFoot: boolean) => {
            ctx.save();
            ctx.translate(limb.x, limb.y);
            ctx.rotate(limb.rot);
            ctx.scale(limb.scale, limb.scale);
            if (isFoot || (char.isEnemy && char.enemyType !== 'melee')) {
                // Pill-shaped foot blob or enemy non-melee hand
                ctx.fillStyle = limbColor;
                ctx.beginPath();
                ctx.roundRect(-4, -3, 10, 6, 3);
                ctx.fill();
            } else {
                // Red glowing dagger for hands!
                ctx.shadowColor = daggerColor;
                ctx.shadowBlur = daggerGlow;
                ctx.fillStyle = daggerColor;

                // Dagger shape (pointing up relative to its own rotation)
                // Note: The arm rotations defined above might need tuning, but let's assume upward pointing is base.
                ctx.beginPath();
                ctx.moveTo(0, 10); // Hilt base (shifted down so it centers better)
                ctx.lineTo(-2, 4); // crossguard left
                ctx.lineTo(-3, 4);
                ctx.lineTo(-3, 2);
                ctx.lineTo(-1, 2);
                ctx.lineTo(0, -12); // TIP (long and sharp)
                ctx.lineTo(1, 2);
                ctx.lineTo(3, 2);
                ctx.lineTo(3, 4);
                ctx.lineTo(2, 4);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        };

        // Draw Background Limbs (Left)
        drawLimb(footL, true);
        drawLimb(handL, false);

        // Draw Main Body (Cute Plum Shape)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(-char.width / 2 + 2, -char.height / 2 + 4);
        ctx.bezierCurveTo(-char.width / 2 - 4, char.height / 2, char.width / 2 + 4, char.height / 2, char.width / 2 - 2, -char.height / 2 + 4);
        ctx.bezierCurveTo(char.width / 2, -char.height / 2 - 8, -char.width / 2, -char.height / 2 - 8, -char.width / 2 + 2, -char.height / 2 + 4);
        ctx.fill();

        // Draw Visor Frame
        ctx.fillStyle = visorColor;
        const visorW = char.width - 6;
        const visorH = char.state === 'crouch' ? 8 : 12;
        const visorY = char.state === 'crouch' ? -2 : -6;
        ctx.beginPath();
        ctx.roundRect(0, visorY, visorW, visorH, 4);
        ctx.fill();

        // Draw Eyes (Inside Visor)
        ctx.fillStyle = eyeColor;
        let eyeH = 4;
        let eyeY = visorY + 2;

        if (char.isSlamming || char.isDashing || (char.exhaustedWallJumpTimer && char.exhaustedWallJumpTimer > 0)) {
            // Angular/Focused/Angry eyes
            ctx.beginPath();
            ctx.moveTo(6, eyeY);
            ctx.lineTo(10, eyeY + 2);
            ctx.lineTo(10, eyeY + 4);
            ctx.lineTo(6, eyeY + 2);
            ctx.fill();
        } else if (isBraking) {
            // Wide-eyed panic
            ctx.beginPath();
            ctx.arc(8, eyeY + 2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Normal blinking
            if (t % 4 > 3.8) {
                eyeH = 1; // Blink closed
                eyeY = visorY + 4;
            }
            ctx.fillRect(8, eyeY, 4, eyeH);
        }

        // Draw Foreground Limbs (Right)
        drawLimb(footR, true);
        drawLimb(handR, false);

        ctx.restore(); // Restore Body Rot

        // --- Overheat / Exhaustion Warning Overlays ---
        if (char.isOverheated) {
            if (Math.floor(t * 20) % 2 === 0) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red flash
                ctx.beginPath();
                ctx.arc(0, 0, char.width, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (char.exhaustedWallJumpTimer && char.exhaustedWallJumpTimer > 0) {
            // Exclamation mark above head
            ctx.save();
            ctx.translate(0, -char.height / 2 - 15);
            const bounce = Math.abs(Math.sin(t * 15)) * 4;
            ctx.translate(0, -bounce);

            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', 0, 0);
            ctx.restore();
        }

        ctx.restore(); // Base context restore
    }
}


