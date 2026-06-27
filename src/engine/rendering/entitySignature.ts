/**
 * Signature of every field the procedural entity raster (DefaultCharacter / EnemyRenderer)
 * depends on. Continuous values are quantized so a static or slow-animating pose yields a
 * stable string — letting the renderer reuse the cached texture and skip the redraw + GPU
 * upload — while dynamic states (hit, dash, wall-slide) change every frame and render live.
 *
 * Position, rotation and squash are intentionally excluded: they are applied to the Pixi
 * sprite transform every frame, not baked into the texture, so motion stays smooth at 60fps.
 *
 * IMPORTANT: if you make the entity raster depend on a NEW field, add it here too — otherwise
 * the cached texture can freeze on a stale pose. (entitySignature.test.ts guards the contract.)
 */
export function entitySignature(c: any): string {
    const trail = c.dashTrail && c.dashTrail.length
        ? `${c.dashTrail.length}:${Math.round(c.dashTrail[c.dashTrail.length - 1].x)},${Math.round(c.dashTrail[c.dashTrail.length - 1].y)}`
        : '';
    return [
        c.state, c.facingRight ? 1 : 0, c.playerIndex ?? 0, c.isEnemy ? 1 : 0, c.enemyType ?? '',
        c.width ?? 20, c.height ?? 28, c.username ?? '',
        Math.floor((c.animationTimer ?? 0) * 20),            // ~20fps pose updates
        Math.round((c.velocityX ?? 0) / 20), Math.round((c.velocityY ?? 0) / 20),
        c.hitStunTimer ? Math.ceil(c.hitStunTimer * 20) : 0, c.hitStunDuration ?? 0, c.hitIntensity ?? '',
        c.exhaustedWallJumpTimer ? Math.ceil(c.exhaustedWallJumpTimer * 20) : 0,
        c.isDashing ? 1 : 0, c.isSlamming ? 1 : 0, c.isOverheated ? 1 : 0, c.isOnWall ? 1 : 0,
        trail,
    ].join('|');
}
