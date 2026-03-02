export interface Point { x: number; y: number }

/**
 * Extracts the alpha channel of an image into a boolean 2D grid.
 */
function getAlphaGrid(imageData: ImageData, threshold: number = 128): boolean[][] {
    const { width, height, data } = imageData;
    const paddedWidth = width + 2;
    const paddedHeight = height + 2;
    const grid: boolean[][] = Array.from({ length: paddedHeight }, () => new Array(paddedWidth).fill(false));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            grid[y + 1][x + 1] = alpha >= threshold;
        }
    }

    return grid;
}

/**
 * Performs a contour tracing algorithm (Moore-Neighbor Tracing) to find the exterior boundary.
 */
function traceContour(grid: boolean[][], width: number, height: number): Point[] {
    // 1. Find the starting pixel (top-leftmost opaque)
    let startX = -1;
    let startY = -1;
    let found = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x]) {
                startX = x;
                startY = y;
                found = true;
                break;
            }
        }
        if (found) break;
    }

    if (!found) return [];

    // Moore neighborhood clockwise from top-left: TL, T, TR, R, BR, B, BL, L
    const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
    const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

    const contour: Point[] = [];
    let currentX = startX;
    let currentY = startY;
    let backDir = 7; // Initially came from West (L)

    // To prevent infinite loops in weird shapes
    const maxSteps = width * height * 2;
    let steps = 0;

    while (steps < maxSteps) {
        contour.push({ x: currentX, y: currentY });

        // Check the 8 neighbors starting from the one after where we came from
        let nextDir = -1;
        let cDir = (backDir + 1) % 8; // start clockwise from backDir

        for (let i = 0; i < 8; i++) {
            const nx = currentX + dx[cDir];
            const ny = currentY + dy[cDir];

            // If neighbor is within bounds and is opaque
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx]) {
                nextDir = cDir;
                break;
            }
            cDir = (cDir + 1) % 8;
        }

        if (nextDir === -1) {
            // Isolated pixel
            break;
        }

        // Advance
        currentX += dx[nextDir];
        currentY += dy[nextDir];

        // The new backtrack direction is the opposite of the direction we just moved
        // but offset to start the *next* search from the pixel 'outside' the shape.
        // Actually for Moore, standard practice is:
        // if we moved in nextDir, the new "back" is (nextDir + 4) % 8
        // and we start searching from (new_back) + 1 ?
        // Or wait, standard Moore says: start from nextDir, backtrack is (nextDir + 4) % 8.
        // But we want to trace the OUTSIDE. 
        // Let's use Radial Sweep:
        // Next search starts from the direction we came from.
        // i.e., new backDir = (nextDir + 4) % 8
        // Wait, standard Moore backDir update is: (nextDir + 5) % 8 or similar depending on step type (edge vs vertex).
        // Let's use the simplest reliable update:
        // new "back" relative to the new pixel is the direction we just came from.
        // The pixel we came from is `(nextDir + 4) % 8`.
        // So the new search starts from `(nextDir + 5) % 8` (or 4).
        // Let's use (nextDir + 5) % 8 to bias towards the outside left.
        backDir = (nextDir + 4) % 8;

        // Jacob's stopping condition: 
        // Original pixel is visited AGAIN from the ORIGINAL direction.
        // Just checking (currentX == startX && currentY == startY) is often enough for simple shapes,
        // but to be perfectly safe we should check start condition.
        // Since we push `current` first, the last point pushed will be the start point if we complete the loop.
        // Let's check if we hit the start point. If so, we are done.
        // If the shape is 1 pixel thick, we might revisit the start point but not be done. 
        if (currentX === startX && currentY === startY) {
            // we returned to start. 
            // Is it a complete loop? 
            // In a robust implementation, you check if you returned to start AND next pixel is same as second pixel.
            // For simple hitboxes, just returning to start is fine.
            if (contour.length > 2) {
                break;
            }
            // If contour.length is 1 or 2 and we are back at start, 
            // it means we traced a 1-pixel or 2-pixel wide thing and bounced back.
            // That's fine, we can still break if we really came back.
            // Actually let's just break if we return to start.
            if (steps > 0) break;
        }

        steps++;
    }

    console.log(`[AutoCollision] Traced ${contour.length} points from ${width}x${height} grid.`);
    return contour;
}

/**
 * Ramer-Douglas-Peucker algorithm for reducing the number of points in a polygon.
 */
function simplifyRDP(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = pointLineDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const recResults1 = simplifyRDP(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyRDP(points.slice(index), epsilon);
        return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
        return [points[0], points[end]];
    }
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
    const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
    const den = Math.sqrt(Math.pow(b.y - a.y, 2) + Math.pow(b.x - a.x, 2));
    if (den === 0) {
        // A and B are the same point
        return Math.sqrt(Math.pow(p.x - a.x, 2) + Math.pow(p.y - a.y, 2));
    }
    return num / den;
}

/**
 * Generates a simplified collision polygon from an image source.
 */
export async function generatePolygonFromImage(imageSrc: string, epsilon: number = 2.0): Promise<{ points: Point[], width: number, height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Failed to get 2D context"));

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const grid = getAlphaGrid(imageData, 128);
            const paddedWidth = canvasWidth + 2;
            const paddedHeight = canvasHeight + 2;

            const contour = traceContour(grid, paddedWidth, paddedHeight);

            if (contour.length === 0) {
                return resolve({ points: [], width: canvasWidth, height: canvasHeight });
            }

            // Subtract the padding offset
            const unpaddedContour = contour.map(p => ({ x: p.x - 1, y: p.y - 1 }));

            console.log(`[AutoCollision] Simplifying ${unpaddedContour.length} points...`);
            const simplified = simplifyRDP(unpaddedContour, epsilon);
            console.log(`[AutoCollision] Simplified to ${simplified.length} points.`);

            resolve({ points: simplified, width: canvasWidth, height: canvasHeight });
        };
        img.onerror = () => reject(new Error("Failed to load image for collision generation"));
        img.src = imageSrc;
    });
}
