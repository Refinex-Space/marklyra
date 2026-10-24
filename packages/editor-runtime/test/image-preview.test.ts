import { describe, expect, it } from 'vitest';
import { imagePreviewRequest } from '../src/images/preview.js';
import {
  constrainImage,
  imageFit,
  rotatedSize,
  zoomImage,
} from '../src/images/preview-geometry.js';

describe('read-only image viewport geometry', () => {
  const image = { width: 1200, height: 2400 },
    viewport = { width: 1000, height: 700 };
  it('fits long images and rotated bounds while keeping small images at natural size', () => {
    expect(imageFit(image, viewport, 0, 'fit')).toBeCloseTo(652 / 2400);
    expect(imageFit(image, viewport, 90, 'fit')).toBeCloseTo(952 / 2400);
    expect(imageFit({ width: 100, height: 100 }, viewport, 0, 'fit')).toBe(1);
    expect(imageFit(image, viewport, 0, 'width')).toBeCloseTo(952 / 1200);
    expect(rotatedSize(image, 180)).toEqual(image);
  });
  it('keeps an arbitrary pointer anchor stable during zoom', () => {
    const before = { scale: 1, x: -100, y: 40, rotation: 90 },
      point = { x: 180, y: -90 };
    const next = zoomImage(before, 2, point);
    expect((point.x - next.x) / next.scale).toBe((point.x - before.x) / before.scale);
    expect((point.y - next.y) / next.scale).toBe((point.y - before.y) / before.scale);
  });
  it('clamps pan independently on both axes after zoom and rotation', () => {
    expect(constrainImage(image, viewport, { scale: 0.5, x: 9999, y: -9999, rotation: 0 })).toEqual(
      { scale: 0.5, x: 0, y: -274, rotation: 0 },
    );
    expect(constrainImage(image, viewport, { scale: 0.5, x: 9999, y: 9999, rotation: 90 })).toEqual(
      { scale: 0.5, x: 124, y: 0, rotation: 90 },
    );
  });
  it('supports fitting below the manual zoom floor and caps manual magnification', () => {
    expect(
      imageFit({ width: 100, height: 16384 }, { width: 200, height: 100 }, 0, 'fit'),
    ).toBeLessThan(0.01);
    expect(zoomImage({ scale: 1, x: 0, y: 0, rotation: 0 }, 100, { x: 0, y: 0 }).scale).toBe(8);
  });
});

describe('preview message validation', () => {
  const value = {
    id: 'preview-1',
    generation: 0,
    name: 'image',
    dark: false,
    url: 'marklyra://localhost/__images/opaque',
  };
  it('accepts a scoped display capability without turning it into file IO', () => {
    expect(imagePreviewRequest(value, 'marklyra://localhost/index.html')).toEqual(value);
  });
  it.each([
    'file:///private/image.png',
    'javascript:alert(1)',
    'https://remote.example/pixel',
    'data:text/html;base64,PHNjcmlwdD4=',
  ])('rejects unsupported display source %s', (url) => {
    expect(() =>
      imagePreviewRequest({ ...value, url }, 'marklyra://localhost/index.html'),
    ).toThrow();
  });
  it('rejects malformed identity and generation fields', () => {
    expect(() => imagePreviewRequest({ ...value, id: '<script>' }, 'http://localhost')).toThrow();
    expect(() =>
      imagePreviewRequest({ ...value, generation: Number.NaN }, 'http://localhost'),
    ).toThrow();
  });
});
