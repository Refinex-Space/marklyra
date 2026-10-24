export interface ImageViewport {
  width: number;
  height: number;
}
export interface ImageTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
}
export type ImageFit = 'fit' | 'width' | 'manual';
export function rotatedSize(image: ImageViewport, rotation: number): ImageViewport {
  return rotation % 180 === 0 ? image : { width: image.height, height: image.width };
}
export function imageFit(
  image: ImageViewport,
  viewport: ImageViewport,
  rotation: number,
  mode: Exclude<ImageFit, 'manual'>,
): number {
  const size = rotatedSize(image, rotation);
  const width = Math.max(1, viewport.width - 48) / size.width;
  return mode === 'width'
    ? Math.min(8, width)
    : Math.min(1, width, Math.max(1, viewport.height - 48) / size.height);
}
export function constrainImage(
  image: ImageViewport,
  viewport: ImageViewport,
  value: ImageTransform,
): ImageTransform {
  const size = rotatedSize(image, value.rotation);
  const limitX = Math.max(0, (size.width * value.scale - viewport.width + 48) / 2);
  const limitY = Math.max(0, (size.height * value.scale - viewport.height + 48) / 2);
  return {
    ...value,
    x: Math.max(-limitX, Math.min(limitX, value.x)),
    y: Math.max(-limitY, Math.min(limitY, value.y)),
  };
}
/** Keep the pixel under the pointer stationary until the image reaches a pan boundary. */
export function zoomImage(
  value: ImageTransform,
  scale: number,
  point: { x: number; y: number },
): ImageTransform {
  const next = Math.max(0.01, Math.min(8, scale));
  return {
    ...value,
    scale: next,
    x: point.x - ((point.x - value.x) * next) / value.scale,
    y: point.y - ((point.y - value.y) * next) / value.scale,
  };
}
