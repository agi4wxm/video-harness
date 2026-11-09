import type { Kit } from "../kit.ts";
import { characterScene } from "./character-scene.ts";
import { processDiagram } from "./process-diagram.ts";
import { scaleZoom } from "./scale-zoom.ts";
import { statCrowd } from "./stat-crowd.ts";
import { titleCard } from "./title-card.ts";

/** 内置积木。新增积木：写一个 defineKit 文件，加到这里（见 docs/dev/kits.md）。 */
export const KITS: Record<string, Kit> = Object.fromEntries(
  [titleCard, statCrowd, processDiagram, characterScene, scaleZoom].map((k) => [k.id, k as unknown as Kit]),
);
