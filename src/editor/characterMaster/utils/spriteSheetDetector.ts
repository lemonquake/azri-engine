/**
 * Sprite Sheet Auto-Detection Utility
 * Analyzes sprite sheet images to detect frame boundaries and grid configuration
 */
import type { DetectionResult } from '../types';

interface AnalysisOptions {
    minFrameSize: number;
    maxFrameSize: number;
    checkAlpha: boolean;
}

const DEFAULT_OPTIONS: AnalysisOptions = {
    minFrameSize: 8,
    maxFrameSize: 512,
    checkAlpha: true,
};

/**
 * Find greatest common divisor
 */
function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

/**
 * Find common divisors within a range
 */
function findDivisors(value: number, min: number, max: number): number[] {
    const divisors: number[] = [];
    for (let i = min; i <= Math.min(max, value); i++) {
        if (value % i === 0) {
            divisors.push(i);
        }
    }
    return divisors;
}

/**
 * Analyze image for potential grid patterns
 */
function analyzeGridPatterns(
    imageData: ImageData,
    width: number,
    height: number,
    options: AnalysisOptions
): DetectionResult[] {
    const results: DetectionResult[] = [];

    // Find common divisors for width and height
    const widthDivisors = findDivisors(width, options.minFrameSize, options.maxFrameSize);
    const heightDivisors = findDivisors(height, options.minFrameSize, options.maxFrameSize);

    // Try common square sizes first (most common for sprites)
    const commonSizes = [16, 32, 48, 64, 96, 128, 256];

    for (const size of commonSizes) {
        if (width % size === 0 && height % size === 0) {
            const cols = width / size;
            const rows = height / size;

            // Calculate confidence based on how "clean" the division is
            const confidence = calculateGridConfidence(imageData, width, height, size, size, options);

            results.push({
                frameWidth: size,
                frameHeight: size,
                columns: cols,
                rows: rows,
                confidence,
                method: 'grid',
            });
        }
    }

    // Try all valid width/height combinations
    for (const fw of widthDivisors) {
        for (const fh of heightDivisors) {
            // Skip if already added as common size
            if (fw === fh && commonSizes.includes(fw)) continue;

            const cols = width / fw;
            const rows = height / fh;

            const confidence = calculateGridConfidence(imageData, width, height, fw, fh, options);

            results.push({
                frameWidth: fw,
                frameHeight: fh,
                columns: cols,
                rows: rows,
                confidence,
                method: 'grid',
            });
        }
    }

    // Sort by confidence
    return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Calculate confidence score for a grid configuration
 */
function calculateGridConfidence(
    imageData: ImageData,
    width: number,
    height: number,
    frameWidth: number,
    frameHeight: number,
    options: AnalysisOptions
): number {
    let confidence = 0;
    const data = imageData.data;

    // Base confidence from clean divisions
    const cols = width / frameWidth;
    const rows = height / frameHeight;

    // Prefer square frames
    if (frameWidth === frameHeight) {
        confidence += 0.1;
    }

    // Prefer common sprite sizes
    const commonSizes = [16, 32, 48, 64, 96, 128];
    if (commonSizes.includes(frameWidth) || commonSizes.includes(frameHeight)) {
        confidence += 0.15;
    }

    // Prefer reasonable grid sizes (not too many, not too few)
    if (cols >= 2 && cols <= 16 && rows >= 1 && rows <= 16) {
        confidence += 0.15;
    }

    if (options.checkAlpha) {
        // Check for alpha patterns at frame boundaries
        let alphaPatternScore = 0;
        let sampleCount = 0;

        // Sample vertical lines at frame boundaries
        for (let col = 1; col < cols; col++) {
            const x = col * frameWidth;
            let hasAlphaVariation = false;

            for (let y = 0; y < height; y += frameHeight / 4) {
                const idx = (Math.floor(y) * width + x) * 4;
                const alpha = data[idx + 3];

                // Check adjacent pixels
                const leftIdx = (Math.floor(y) * width + x - 1) * 4;
                const rightIdx = (Math.floor(y) * width + x + 1) * 4;

                if (leftIdx >= 0 && rightIdx < data.length) {
                    const leftAlpha = data[leftIdx + 3];
                    const rightAlpha = data[rightIdx + 3];

                    // If there's significant alpha change at boundary
                    if (Math.abs(leftAlpha - alpha) > 50 || Math.abs(rightAlpha - alpha) > 50) {
                        hasAlphaVariation = true;
                    }
                }
            }

            if (hasAlphaVariation) {
                alphaPatternScore += 1;
            }
            sampleCount++;
        }

        // Sample horizontal lines at frame boundaries
        for (let row = 1; row < rows; row++) {
            const y = row * frameHeight;
            let hasAlphaVariation = false;

            for (let x = 0; x < width; x += frameWidth / 4) {
                const idx = (y * width + Math.floor(x)) * 4;
                const alpha = data[idx + 3];

                // Check adjacent pixels
                const topIdx = ((y - 1) * width + Math.floor(x)) * 4;
                const bottomIdx = ((y + 1) * width + Math.floor(x)) * 4;

                if (topIdx >= 0 && bottomIdx < data.length) {
                    const topAlpha = data[topIdx + 3];
                    const bottomAlpha = data[bottomIdx + 3];

                    if (Math.abs(topAlpha - alpha) > 50 || Math.abs(bottomAlpha - alpha) > 50) {
                        hasAlphaVariation = true;
                    }
                }
            }

            if (hasAlphaVariation) {
                alphaPatternScore += 1;
            }
            sampleCount++;
        }

        if (sampleCount > 0) {
            confidence += (alphaPatternScore / sampleCount) * 0.3;
        }
    }

    // Check for content variation within frames (non-empty frames)
    let nonEmptyFrames = 0;


    for (let row = 0; row < Math.min(rows, 4); row++) {
        for (let col = 0; col < Math.min(cols, 4); col++) {
            const fx = col * frameWidth;
            const fy = row * frameHeight;

            let hasContent = false;

            // Sample a few pixels within the frame
            for (let sy = 0; sy < frameHeight && !hasContent; sy += Math.max(1, frameHeight / 4)) {
                for (let sx = 0; sx < frameWidth && !hasContent; sx += Math.max(1, frameWidth / 4)) {
                    const px = fx + Math.floor(sx);
                    const py = fy + Math.floor(sy);
                    const idx = (py * width + px) * 4;

                    if (idx + 3 < data.length && data[idx + 3] > 10) {
                        hasContent = true;
                    }
                }
            }

            if (hasContent) nonEmptyFrames++;
        }
    }

    const sampledFrames = Math.min(cols * rows, 16);
    const contentRatio = nonEmptyFrames / sampledFrames;

    // Prefer configurations where most frames have content
    if (contentRatio > 0.5) {
        confidence += 0.2 * contentRatio;
    }

    return Math.min(1, Math.max(0, confidence));
}

/**
 * Main detection function
 */
export async function detectSpriteSheetConfig(
    image: HTMLImageElement,
    options: Partial<AnalysisOptions> = {}
): Promise<DetectionResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Create canvas to analyze image
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    // Analyze grid patterns
    const results = analyzeGridPatterns(imageData, image.width, image.height, opts);

    // If no results, provide a fallback based on image dimensions
    if (results.length === 0) {
        const g = gcd(image.width, image.height);
        results.push({
            frameWidth: g,
            frameHeight: g,
            columns: image.width / g,
            rows: image.height / g,
            confidence: 0.1,
            method: 'grid',
        });
    }

    return results;
}

/**
 * Quick detection - returns the best result
 */
export async function detectBestConfig(
    image: HTMLImageElement,
    options?: Partial<AnalysisOptions>
): Promise<DetectionResult | null> {
    const results = await detectSpriteSheetConfig(image, options);
    return results.length > 0 ? results[0] : null;
}

/**
 * Suggest frame dimensions based on common sprite sizes
 */
export function suggestFrameSizes(width: number, height: number): { width: number; height: number }[] {
    const suggestions: { width: number; height: number }[] = [];
    const commonSizes = [16, 24, 32, 48, 64, 96, 128, 256];

    for (const size of commonSizes) {
        if (width % size === 0 && height % size === 0) {
            suggestions.push({ width: size, height: size });
        }
    }

    // Also add non-square options
    for (const w of commonSizes) {
        for (const h of commonSizes) {
            if (w !== h && width % w === 0 && height % h === 0) {
                suggestions.push({ width: w, height: h });
            }
        }
    }

    // Limit to reasonable number
    return suggestions.slice(0, 10);
}
