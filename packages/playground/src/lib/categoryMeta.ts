import {
  IconBlur, IconGrain, IconContrast, IconShape,
  IconPalette, IconResize, IconSparkles, type Icon,
} from "@tabler/icons-react";

export interface CategoryMeta {
  label: string;
  color: string; // a Mantine theme color name
  icon: Icon;
}

// Visual identity for each op category — drives the accent colour + icon shown
// in the op panel and on each pipeline step card.
export const CATEGORY_META: Record<string, CategoryMeta> = {
  filter:     { label: "Filter",              color: "indigo", icon: IconBlur },
  edge:       { label: "Edge detection",      color: "grape",  icon: IconGrain },
  threshold:  { label: "Thresholding",        color: "teal",   icon: IconContrast },
  morphology: { label: "Morphology",          color: "orange", icon: IconShape },
  color:      { label: "Color space",         color: "pink",   icon: IconPalette },
  geometry:   { label: "Geometric transform", color: "cyan",   icon: IconResize },
  denoise:    { label: "Denoise",             color: "blue",   icon: IconSparkles },
};

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? { label: category, color: "gray", icon: IconShape };
}
