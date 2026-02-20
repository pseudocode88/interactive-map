import type { DemoMapDefinition } from "./types";
import { olympusMapDefinition } from "./olympus";

export const mapRegistry: Record<string, DemoMapDefinition> = {
  [olympusMapDefinition.id]: olympusMapDefinition,
};
