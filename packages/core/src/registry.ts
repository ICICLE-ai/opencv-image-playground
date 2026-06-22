// Describes what a single op looks like — its name, category, and params
export interface OpDef {
  name: string;
  category: OpCategory;
  description: string;
  params: Record<string, ParamDef>;
}

export type OpCategory =
  | "filter"
  | "edge"
  | "threshold"
  | "morphology"
  | "color"
  | "geometry"
  | "denoise";

// Each param is one of these types — the UI renders the right control for each
export type ParamDef =
  | { type: "int";   label: string; min: number; max: number; step: number; default: number }
  | { type: "float"; label: string; min: number; max: number; step: number; default: number }
  | { type: "bool";  label: string; default: boolean }
  | { type: "enum";  label: string; options: { label: string; value: string }[]; default: string };

export type ParamValue = number | boolean | string;

// The registry — every supported op lives here
// Key = the string sent to FastAPI, value = the op definition
export const OP_REGISTRY: Record<string, OpDef> = {

  // ── Filters ───────────────────────────────────────────────────────────────

  gaussian_blur: {
    name: "Gaussian blur",
    category: "filter",
    description: "Smooths the image. Good for reducing noise.",
    params: {
      ksize:   { type: "int",   label: "Kernel size", min: 1, max: 31, step: 2, default: 5 },
      sigma_x: { type: "float", label: "Sigma X",     min: 0, max: 10, step: 0.1, default: 0 },
    },
  },

  median_blur: {
    name: "Median blur",
    category: "filter",
    description: "Replaces each pixel with the median of its neighbourhood. Great for salt-and-pepper noise.",
    params: {
      ksize: { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 5 },
    },
  },

  bilateral_filter: {
    name: "Bilateral filter",
    category: "filter",
    description: "Smooths while preserving edges. Slower but higher quality than Gaussian.",
    params: {
      d:           { type: "int",   label: "Diameter",    min: 1, max: 25,  step: 1, default: 9 },
      sigma_color: { type: "float", label: "Sigma color", min: 1, max: 200, step: 1, default: 75 },
      sigma_space: { type: "float", label: "Sigma space", min: 1, max: 200, step: 1, default: 75 },
    },
  },

  sharpen: {
    name: "Sharpen",
    category: "filter",
    description: "Enhances edges using an unsharp mask kernel.",
    params: {
      strength: { type: "float", label: "Strength", min: 0.1, max: 5, step: 0.1, default: 1.5 },
    },
  },

  // ── Edge detection ────────────────────────────────────────────────────────

  canny: {
    name: "Canny edge",
    category: "edge",
    description: "Multi-stage edge detection. Industry standard.",
    params: {
      threshold1: { type: "int", label: "Threshold 1", min: 0, max: 500, step: 1, default: 50 },
      threshold2: { type: "int", label: "Threshold 2", min: 0, max: 500, step: 1, default: 150 },
    },
  },

  sobel: {
    name: "Sobel",
    category: "edge",
    description: "Computes image gradient — detects horizontal or vertical edges.",
    params: {
      dx:    { type: "int", label: "X order", min: 0, max: 2, step: 1, default: 1 },
      dy:    { type: "int", label: "Y order", min: 0, max: 2, step: 1, default: 0 },
      ksize: { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
    },
  },

  laplacian: {
    name: "Laplacian",
    category: "edge",
    description: "Second-order derivative. Detects edges in all directions.",
    params: {
      ksize: { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
    },
  },

  // ── Threshold ─────────────────────────────────────────────────────────────

  threshold_binary: {
    name: "Binary threshold",
    category: "threshold",
    description: "Pixels above threshold become white, below become black.",
    params: {
      thresh: { type: "int", label: "Threshold", min: 0, max: 255, step: 1, default: 127 },
      maxval: { type: "int", label: "Max value",  min: 0, max: 255, step: 1, default: 255 },
    },
  },

  threshold_otsu: {
    name: "Otsu threshold",
    category: "threshold",
    description: "Automatically finds optimal threshold from the image histogram.",
    params: {},
  },

  adaptive_threshold: {
    name: "Adaptive threshold",
    category: "threshold",
    description: "Threshold varies per region. Better for uneven lighting.",
    params: {
      block_size: { type: "int",   label: "Block size", min: 3,   max: 99, step: 2, default: 11 },
      c:          { type: "float", label: "C constant", min: -20, max: 20, step: 1, default: 2 },
      method: {
        type: "enum",
        label: "Method",
        options: [
          { label: "Gaussian", value: "gaussian" },
          { label: "Mean",     value: "mean" },
        ],
        default: "gaussian",
      },
    },
  },

  // ── Morphology ────────────────────────────────────────────────────────────

  erode: {
    name: "Erode",
    category: "morphology",
    description: "Shrinks bright regions. Removes small white noise.",
    params: {
      ksize:      { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
      iterations: { type: "int", label: "Iterations",  min: 1, max: 10, step: 1, default: 1 },
    },
  },

  dilate: {
    name: "Dilate",
    category: "morphology",
    description: "Expands bright regions. Fills small holes.",
    params: {
      ksize:      { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
      iterations: { type: "int", label: "Iterations",  min: 1, max: 10, step: 1, default: 1 },
    },
  },

  morphology_open: {
    name: "Morphological open",
    category: "morphology",
    description: "Erode then dilate. Removes small bright objects.",
    params: {
      ksize: { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
    },
  },

  morphology_close: {
    name: "Morphological close",
    category: "morphology",
    description: "Dilate then erode. Fills small dark holes.",
    params: {
      ksize: { type: "int", label: "Kernel size", min: 1, max: 31, step: 2, default: 3 },
    },
  },

  // ── Color ─────────────────────────────────────────────────────────────────

  grayscale: {
    name: "Grayscale",
    category: "color",
    description: "Converts image to single-channel luminance.",
    params: {},
  },

  equalize_hist: {
    name: "Histogram equalisation",
    category: "color",
    description: "Spreads intensity values across the full range. Improves contrast.",
    params: {},
  },

  clahe: {
    name: "CLAHE",
    category: "color",
    description: "Contrast-limited adaptive histogram equalisation. Better than global equalisation for local regions.",
    params: {
      clip_limit:  { type: "float", label: "Clip limit",  min: 0.5, max: 10, step: 0.5, default: 2.0 },
      tile_grid_x: { type: "int",   label: "Tile grid X", min: 2,   max: 16, step: 1,   default: 8 },
      tile_grid_y: { type: "int",   label: "Tile grid Y", min: 2,   max: 16, step: 1,   default: 8 },
    },
  },

  invert: {
    name: "Invert",
    category: "color",
    description: "Inverts all pixel values (255 - pixel).",
    params: {},
  },

  // ── Geometry ──────────────────────────────────────────────────────────────

  resize: {
    name: "Resize",
    category: "geometry",
    description: "Scale image to a new width and height.",
    params: {
      width:  { type: "int", label: "Width (px)",  min: 1, max: 4096, step: 1, default: 640 },
      height: { type: "int", label: "Height (px)", min: 1, max: 4096, step: 1, default: 480 },
    },
  },

  rotate: {
    name: "Rotate",
    category: "geometry",
    description: "Rotate image around its centre by any angle.",
    params: {
      angle: { type: "float", label: "Angle (°)", min: -180, max: 180, step: 1,   default: 0 },
      scale: { type: "float", label: "Scale",     min: 0.1,  max: 3,   step: 0.1, default: 1.0 },
    },
  },

  flip: {
    name: "Flip",
    category: "geometry",
    description: "Mirror the image horizontally, vertically, or both.",
    params: {
      direction: {
        type: "enum",
        label: "Direction",
        options: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical",   value: "vertical" },
          { label: "Both",       value: "both" },
        ],
        default: "horizontal",
      },
    },
  },

  // ── Denoise ───────────────────────────────────────────────────────────────

  fast_nl_means: {
    name: "Non-local means denoise",
    category: "denoise",
    description: "High quality denoising. Slower — best for offline processing.",
    params: {
      h:               { type: "float", label: "Filter strength", min: 1,  max: 30, step: 1, default: 10 },
      template_window: { type: "int",   label: "Template window", min: 3,  max: 21, step: 2, default: 7 },
      search_window:   { type: "int",   label: "Search window",   min: 11, max: 41, step: 2, default: 21 },
    },
  },

  // ── Channel operations ───────────────────────────────────────────────────

  channel_adjust_rgb: {
    name: "RGB channel adjust",
    category: "color",
    description: "Independently scale and offset the red, green, and blue channels.",
    params: {
      r_scale:  { type: "float", label: "Red scale",   min: 0, max: 2, step: 0.05, default: 1 },
      r_offset: { type: "int",   label: "Red offset",  min: -100, max: 100, step: 1, default: 0 },
      g_scale:  { type: "float", label: "Green scale",  min: 0, max: 2, step: 0.05, default: 1 },
      g_offset: { type: "int",   label: "Green offset", min: -100, max: 100, step: 1, default: 0 },
      b_scale:  { type: "float", label: "Blue scale",   min: 0, max: 2, step: 0.05, default: 1 },
      b_offset: { type: "int",   label: "Blue offset",  min: -100, max: 100, step: 1, default: 0 },
    },
  },

  hsv_adjust: {
    name: "HSV adjust",
    category: "color",
    description: "Shift hue, scale saturation, and scale value (brightness) independently.",
    params: {
      hue_shift:  { type: "int",   label: "Hue shift (°)", min: -180, max: 180, step: 1,    default: 0 },
      sat_scale:  { type: "float", label: "Saturation",    min: 0,    max: 2,   step: 0.05, default: 1 },
      val_scale:  { type: "float", label: "Value",         min: 0,    max: 2,   step: 0.05, default: 1 },
    },
  },

  extract_channel: {
    name: "Extract channel (preview)",
    category: "color",
    description: "Isolate one channel and view it as grayscale. Useful for analysis, not further processing.",
    params: {
      color_space: {
        type: "enum",
        label: "Color space",
        options: [
          { label: "RGB", value: "rgb" },
          { label: "HSV", value: "hsv" },
        ],
        default: "rgb",
      },
      channel: {
        type: "enum",
        label: "Channel",
        options: [
          { label: "Channel 1 (R / H)", value: "0" },
          { label: "Channel 2 (G / S)", value: "1" },
          { label: "Channel 3 (B / V)", value: "2" },
        ],
        default: "0",
      },
    },
  },

};

export const OP_CATEGORIES = ["filter", "edge", "threshold", "morphology", "color", "geometry"] as const;

export function getOpsByCategory(category: string): Array<[string, OpDef]> {
  return Object.entries(OP_REGISTRY).filter(([, def]) => def.category === category);
}

export function defaultParams(op: OpDef): Record<string, ParamValue> {
  return Object.fromEntries(
    Object.entries(op.params).map(([key, def]) => [key, def.default])
  );
}