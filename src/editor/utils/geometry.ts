/**
 * Geometry utility functions for Level Editor tools
 */

export interface Point {
    x: number;
    y: number;
}

// Bresenham's Line Algorithm
export function getLinePoints(start: Point, end: Point): Point[] {
    const points: Point[] = [];
    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        points.push({ x: x0, y: y0 });

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
    return points;
}

// Rectangle Points (Outline)
export function getRectangleOutlinePoints(start: Point, end: Point): Point[] {
    const points: Point[] = [];
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    for (let x = minX; x <= maxX; x++) {
        points.push({ x, y: minY });
        points.push({ x, y: maxY });
    }
    for (let y = minY + 1; y < maxY; y++) {
        points.push({ x: minX, y });
        points.push({ x: maxX, y });
    }
    return points;
}

// Rectangle Points (Filled)
export function getRectangleFillPoints(start: Point, end: Point): Point[] {
    const points: Point[] = [];
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            points.push({ x, y });
        }
    }
    return points;
}

// Midpoint Circle Algorithm (Outline)
export function getCircleOutlinePoints(center: Point, radius: number): Point[] {
    const points: Point[] = [];
    let x = radius;
    let y = 0;
    let err = 0;

    while (x >= y) {
        points.push({ x: center.x + x, y: center.y + y });
        points.push({ x: center.x + y, y: center.y + x });
        points.push({ x: center.x - y, y: center.y + x });
        points.push({ x: center.x - x, y: center.y + y });
        points.push({ x: center.x - x, y: center.y - y });
        points.push({ x: center.x - y, y: center.y - x });
        points.push({ x: center.x + y, y: center.y - x });
        points.push({ x: center.x + x, y: center.y - y });

        if (err <= 0) {
            y += 1;
            err += 2 * y + 1;
        }
        if (err > 0) {
            x -= 1;
            err -= 2 * x + 1;
        }
    }
    return points;
}

// Circle Points (Filled)
export function getCircleFillPoints(center: Point, radius: number): Point[] {
    const points: Point[] = [];
    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            if (x * x + y * y <= radius * radius + radius) { // +radius for better look?
                points.push({ x: center.x + x, y: center.y + y });
            }
        }
    }
    return points;
}

// Brush Points (Square for now, could be circle)
export function getBrushPoints(center: Point, size: number): Point[] {
    if (size <= 1) return [center];
    const points: Point[] = [];
    // Actually, for even sizes, it's tricky. Let's assume top-left anchor or center?
    // Let's do center-ish.
    const startX = center.x - Math.floor(size / 2);
    const startY = center.y - Math.floor(size / 2);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            points.push({ x: startX + x, y: startY + y });
        }
    }
    return points;
}

export interface SymmetrySettings {
    enabled: boolean;
    axis: 'x' | 'y' | 'both';
    center: { x: number; y: number } | null;
}

export function getSymmetricalPoints(points: Point[], symmetry: SymmetrySettings): Point[] {
    if (!symmetry.enabled) return points;
    const result: Point[] = [];
    const seen = new Set<string>();

    const add = (p: Point) => {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(p);
        }
    };

    points.forEach(p => {
        add(p);
        // Default mirroring around 0 (or -0.5 grid line)
        // If center is provided, we should mirror around it. 
        // Current implementation in Editor was hardcoded to -0.5 (x: -p.x - 1).
        // Let's stick to that for now if center is null.

        let mirrorX = -p.x - 1;
        let mirrorY = -p.y - 1;

        if (symmetry.center) {
            // Mirror around center.x
            // if x=1, center=5. diff = 4. newX = 5+4 = 9? 
            // Formula: newX = center + (center - oldX) = 2*center - oldX
            // But we are on Grid.
            // If center is 5.
            mirrorX = 2 * symmetry.center.x - p.x;
            mirrorY = 2 * symmetry.center.y - p.y;
            // Note: Center might need to be half-grid based for perfect symmetry? 
            // Types say center is x,y (number).
        }

        if (symmetry.axis === 'x' || symmetry.axis === 'both') {
            add({ x: mirrorX, y: p.y });
        }
        if (symmetry.axis === 'y' || symmetry.axis === 'both') {
            add({ x: p.x, y: mirrorY });
        }
        if (symmetry.axis === 'both') {
            add({ x: mirrorX, y: mirrorY });
        }
    });

    return result;
}
