import { expect, it, vi } from 'vitest';
import {
  drawMarks,
  fitImage,
  imagePoint,
  validImageSize,
} from '../src/features/ai/image-preview.js';

it('fits without distortion/upscaling and rejects unbounded output sizes', () => {
  expect(fitImage({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toBe(0.5);
  expect(fitImage({ width: 100, height: 100 }, { width: 1000, height: 800 })).toBe(1);
  expect(validImageSize(4096, 4096)).toBe(true);
  for (const [width, height] of [
    [0, 1],
    [1.2, 1],
    [16385, 1],
    [10000, 10000],
    [NaN, 20],
  ] as const)
    expect(validImageSize(width, height)).toBe(false);
});
it('clamps pointer positions to the image regardless of viewport scale', () => {
  const rect = { left: 100, top: 100, width: 400, height: 200 };
  expect(imagePoint({ x: 300, y: 200 }, rect)).toEqual({ x: 0.5, y: 0.5 });
  expect(imagePoint({ x: -1, y: 1000 }, rect)).toEqual({ x: 0, y: 1 });
});
it('renders annotations in normalized coordinates to match resized exports', () => {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    measureText: () => ({ width: 40 }),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
  drawMarks(
    context as unknown as CanvasRenderingContext2D,
    [
      {
        kind: 'stroke',
        color: '#f00',
        points: [
          { x: 0.5, y: 0.25 },
          { x: 1, y: 1 },
        ],
      },
      { kind: 'comment', color: '#f00', point: { x: 0.5, y: 0.5 }, text: 'Note' },
    ],
    800,
    400,
  );
  expect(context.moveTo).toHaveBeenCalledWith(400, 100);
  expect(context.lineTo).toHaveBeenCalledWith(800, 400);
  expect(context.fillText).toHaveBeenCalledWith('Note', 400, 200, 40);
});

it('ships the SVG assets required by the image viewer without executable content', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const root = new URL('../public/icons/image-viewer/', import.meta.url);
  const files = (await readdir(root)).filter((name) => name.endsWith('.svg')).sort();
  expect(files).toEqual(
    'arrow-back-up arrows-maximize chevron-down download external-link message-circle pencil photo x'
      .split(' ')
      .map((name) => `${name}.svg`),
  );
  for (const file of files) {
    const svg = await readFile(new URL(file, root), 'utf8');
    expect(svg).toMatch(/<svg\b/);
    expect(svg).toMatch(/\bviewBox=["'][^"']+["']/);
    expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href=["']https?:/i);
  }
});
