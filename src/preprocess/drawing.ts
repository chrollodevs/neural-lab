import type { InputSample } from '../model/types';

const TARGET_SIZE = 28;
const INK_THRESHOLD = 8;
const TARGET_INK_SIZE = 20;

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(width - 1, left + 1);
  const bottom = Math.min(height - 1, top + 1);
  const xWeight = x - left;
  const yWeight = y - top;
  const topLeft = source[top * width + left] ?? 0;
  const topRight = source[top * width + right] ?? 0;
  const bottomLeft = source[bottom * width + left] ?? 0;
  const bottomRight = source[bottom * width + right] ?? 0;
  const topValue = topLeft + (topRight - topLeft) * xWeight;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * xWeight;
  return topValue + (bottomValue - topValue) * yWeight;
}

function centerByMass(tensor: Float32Array): Float32Array {
  let mass = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < TARGET_SIZE; y++) {
    for (let x = 0; x < TARGET_SIZE; x++) {
      const value = tensor[y * TARGET_SIZE + x] ?? 0;
      mass += value;
      weightedX += x * value;
      weightedY += y * value;
    }
  }
  if (mass === 0) return tensor;

  const shiftX = Math.floor(13.5 - weightedX / mass + 0.5);
  const shiftY = Math.floor(13.5 - weightedY / mass + 0.5);
  if (shiftX === 0 && shiftY === 0) return tensor;

  const centered = new Float32Array(tensor.length);
  for (let y = 0; y < TARGET_SIZE; y++) {
    for (let x = 0; x < TARGET_SIZE; x++) {
      const destinationX = x + shiftX;
      const destinationY = y + shiftY;
      if (
        destinationX >= 0 &&
        destinationX < TARGET_SIZE &&
        destinationY >= 0 &&
        destinationY < TARGET_SIZE
      ) {
        centered[destinationY * TARGET_SIZE + destinationX] = tensor[y * TARGET_SIZE + x] ?? 0;
      }
    }
  }
  return centered;
}

export function preprocessAlphaRaster(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  if (alpha.length !== width * height || width <= 0 || height <= 0) {
    throw new Error('Alpha raster dimensions do not match its pixel data.');
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((alpha[y * width + x] ?? 0) > INK_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return new Float32Array(TARGET_SIZE * TARGET_SIZE);

  const sourceWidth = maxX - minX + 1;
  const sourceHeight = maxY - minY + 1;
  const scale = TARGET_INK_SIZE / Math.max(sourceWidth, sourceHeight);
  const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
  const cropped = new Uint8ClampedArray(sourceWidth * sourceHeight);
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      cropped[y * sourceWidth + x] = alpha[(minY + y) * width + minX + x] ?? 0;
    }
  }

  const tensor = new Float32Array(TARGET_SIZE * TARGET_SIZE);
  const offsetX = Math.floor((TARGET_SIZE - scaledWidth) / 2);
  const offsetY = Math.floor((TARGET_SIZE - scaledHeight) / 2);

  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      const destinationX = x + offsetX;
      const destinationY = y + offsetY;
      if (destinationX < 0 || destinationX >= TARGET_SIZE || destinationY < 0 || destinationY >= TARGET_SIZE) continue;
      const sourceX = ((x + 0.5) * sourceWidth) / scaledWidth - 0.5;
      const sourceY = ((y + 0.5) * sourceHeight) / scaledHeight - 0.5;
      tensor[destinationY * TARGET_SIZE + destinationX] = sampleBilinear(
        cropped,
        sourceWidth,
        sourceHeight,
        Math.max(0, Math.min(sourceWidth - 1, sourceX)),
        Math.max(0, Math.min(sourceHeight - 1, sourceY)),
      ) / 255;
    }
  }

  return centerByMass(tensor);
}

export function rasterizeDrawing(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Drawing canvas is unavailable.');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3] ?? 0;
  return preprocessAlphaRaster(alpha, canvas.width, canvas.height);
}

export function createDrawingInput(canvas: HTMLCanvasElement): InputSample {
  return { source: 'draw', tensor28: rasterizeDrawing(canvas) };
}
