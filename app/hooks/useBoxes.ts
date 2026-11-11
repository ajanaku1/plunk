'use client';

import { type Boxes, useBoxesContext } from '@/providers/boxes';

export type { Boxes };

/** Every box, newest first, from the shared BoxesProvider (FR-029). */
export function useBoxes(): Boxes {
  return useBoxesContext();
}
