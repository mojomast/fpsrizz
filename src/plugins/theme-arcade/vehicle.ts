import type { Painter } from '../../sdk/index.ts';

/** Original procedural art: top-down courier, nose up. No Assetrizz pixels. */
export const vehicle: Painter = {
  width: 48,
  height: 80,
  paint(ctx) {
    ctx.clearRect(0, 0, 48, 80);
    ctx.fillStyle = '#071122';
    ctx.fillRect(7, 15, 8, 18);
    ctx.fillRect(33, 15, 8, 18);
    ctx.fillRect(7, 51, 8, 18);
    ctx.fillRect(33, 51, 8, 18);
    ctx.fillStyle = '#fb658d';
    ctx.beginPath();
    ctx.moveTo(24, 3);
    ctx.lineTo(36, 19);
    ctx.lineTo(36, 67);
    ctx.lineTo(30, 75);
    ctx.lineTo(18, 75);
    ctx.lineTo(12, 67);
    ctx.lineTo(12, 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#37e8ee';
    ctx.fillRect(16, 20, 16, 13);
    ctx.fillRect(13, 46, 3, 19);
    ctx.fillRect(32, 46, 3, 19);
    ctx.fillStyle = '#182a50';
    ctx.fillRect(17, 37, 14, 23);
    ctx.fillStyle = '#fff0b3';
    ctx.fillRect(15, 14, 5, 4);
    ctx.fillRect(28, 14, 5, 4);
    ctx.fillRect(21, 65, 6, 8);
  },
};
