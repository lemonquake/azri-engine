import { describe, it, expect } from 'vitest';
import { entitySignature } from './entitySignature';

const base = () => ({
    state: 'idle', facingRight: true, playerIndex: 1, width: 20, height: 28,
    animationTimer: 0, velocityX: 0, velocityY: 0,
});

describe('entitySignature (entity render cache key)', () => {
    it('is stable when only the position changes — so a standing entity reuses its texture', () => {
        expect(entitySignature({ ...base(), x: 0, y: 0 }))
            .toBe(entitySignature({ ...base(), x: 999, y: 500 }));
    });

    it('is stable within a ~20fps window and changes across it', () => {
        const a = entitySignature({ ...base(), animationTimer: 0.00 });
        const b = entitySignature({ ...base(), animationTimer: 0.02 }); // same 1/20s bucket
        const c = entitySignature({ ...base(), animationTimer: 0.06 }); // next bucket
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    it('changes when the animation state changes', () => {
        expect(entitySignature({ ...base(), state: 'idle' }))
            .not.toBe(entitySignature({ ...base(), state: 'walk' }));
    });

    it('changes on facing flip and player index', () => {
        expect(entitySignature({ ...base(), facingRight: true }))
            .not.toBe(entitySignature({ ...base(), facingRight: false }));
        expect(entitySignature({ ...base(), playerIndex: 1 }))
            .not.toBe(entitySignature({ ...base(), playerIndex: 2 }));
    });

    it('changes every frame while dashing (trail moves) so the effect renders live', () => {
        const f1 = entitySignature({ ...base(), isDashing: true, dashTrail: [{ x: 10, y: 5 }] });
        const f2 = entitySignature({ ...base(), isDashing: true, dashTrail: [{ x: 10, y: 5 }, { x: 14, y: 6 }] });
        expect(f1).not.toBe(f2);
    });

    it('reflects hit-stun and wall states (no stale pose during dynamic states)', () => {
        expect(entitySignature(base()))
            .not.toBe(entitySignature({ ...base(), hitStunTimer: 0.3, hitStunDuration: 0.3 }));
        expect(entitySignature(base()))
            .not.toBe(entitySignature({ ...base(), isOnWall: true }));
    });
});
