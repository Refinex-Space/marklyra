export interface ImagePoint {
  x: number;
  y: number;
}
export type ImageMark =
  | { kind: 'stroke'; color: string; points: ImagePoint[] }
  | { kind: 'comment'; color: string; point: ImagePoint; text: string };
export function fitImage(
  image: { width: number; height: number },
  area: { width: number; height: number },
) {
  return Math.max(0.01, Math.min(1, area.width / image.width, area.height / image.height));
}
export function imagePoint(
  client: ImagePoint,
  rect: { left: number; top: number; width: number; height: number },
): ImagePoint {
  return {
    x: Math.max(0, Math.min(1, (client.x - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (client.y - rect.top) / rect.height)),
  };
}
export function validImageSize(width: number, height: number) {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 16384 &&
    height <= 16384 &&
    width * height <= 16_777_216
  );
}
export function drawMarks(
  context: CanvasRenderingContext2D,
  marks: ImageMark[],
  width: number,
  height: number,
) {
  for (const mark of marks) {
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    context.lineWidth = Math.max(2, Math.min(width, height) / 250);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (mark.kind === 'stroke') {
      context.beginPath();
      mark.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x * width, point.y * height);
        else context.lineTo(point.x * width, point.y * height);
      });
      if (mark.points.length === 1) {
        const point = mark.points[0];
        if (point) context.lineTo(point.x * width + 0.01, point.y * height + 0.01);
      }
      context.stroke();
    } else {
      const font = Math.max(14, Math.round(Math.min(width, height) / 35));
      context.font = `500 ${font}px system-ui, sans-serif`;
      const textWidth = Math.min(context.measureText(mark.text).width, width - 20);
      const x = Math.max(4, Math.min(mark.point.x * width, width - textWidth - 12));
      const y = Math.max(font + 8, Math.min(mark.point.y * height, height - 8));
      context.fillStyle = '#ffffff';
      context.fillRect(x - 4, y - font - 3, textWidth + 8, font + 10);
      context.fillStyle = mark.color;
      context.fillText(mark.text, x, y, textWidth);
    }
  }
}
