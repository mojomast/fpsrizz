import type { Painter } from '@bulkhead/sdk';
import { fantasyTextures } from './fantasy-generated.ts';

/** Crop the source tiles' transparent presentation margins before repeating them on world geometry. */
function tile(key: string, inset: number, shade = 1): Painter {
  const source = fantasyTextures[key]!;
  return { width: 64, height: 64, paint(ctx) {
    source.paint(ctx);
    const original = ctx.getImageData(0, 0, 64, 64), output = ctx.createImageData(64, 64);
    const size = 64 - inset * 2;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const from = (Math.floor(inset + y * size / 64) * 64 + Math.floor(inset + x * size / 64)) * 4;
      const to = (y * 64 + x) * 4, alpha = original.data[from + 3]! / 255;
      const luma = original.data[from]! * .3 + original.data[from + 1]! * .59 + original.data[from + 2]! * .11;
      for (let c = 0; c < 3; c++) output.data[to + c] = ((original.data[from + c]! * .65 + luma * .35) * alpha + 38 * (1 - alpha)) * shade;
      output.data[to + 3] = 255;
    }
    ctx.putImageData(output, 0, 0);
  } };
}

export const cinderSurfaces: Readonly<Record<string, Painter>> = Object.freeze({
  'wall-panel': tile('wall-panel', 6), 'wall-brick': tile('wall-brick', 3), 'wall-tech': tile('wall-tech', 1),
  'floor-plate': tile('floor-plate', 5, .85), 'floor-concrete': tile('floor-concrete', 7, .85),
  'ceiling-panel': tile('wall-tech', 1, .42),
});
