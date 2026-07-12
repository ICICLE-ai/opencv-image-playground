// Client-side opencv.js port of the operations defined in
// packages/opencv-executor/opencv_executor/ops.py. Keys MUST stay identical to
// OP_REGISTRY (packages/core) and the Python OP_MAP so exported operations.json
// files round-trip across the browser and the Python executor.
//
// Contract: every op takes an **RGBA** Mat (canvas-native) and returns a fresh
// **RGBA** Mat. Ops that need grayscale/RGB convert internally and convert the
// result back to RGBA — mirroring the Python ops that always return BGR. Every
// intermediate Mat is `.delete()`d to avoid leaking the WASM heap.

import type { ParamValue } from "@opencv-image-playground/core";

/* opencv.js typings are incomplete for the Mat manipulation API used here, so
   the cv namespace and Mat values are intentionally treated as `any`. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Cv = any;
type Mat = any;
/* eslint-enable @typescript-eslint/no-explicit-any */
type Params = Record<string, ParamValue>;

export type OpFn = (cv: Cv, src: Mat, p: Params) => Mat;

// ─── Param helpers ──────────────────────────────────────────────────────────

const num = (p: Params, k: string, d: number): number => {
  const v = Number(p[k]);
  return Number.isFinite(v) ? v : d;
};
const int = (p: Params, k: string, d: number): number => Math.round(num(p, k, d));
const str = (p: Params, k: string, d: string): string =>
  p[k] != null ? String(p[k]) : d;
const oddify = (n: number): number => (n % 2 === 0 ? n + 1 : n);

// ─── Color helpers ──────────────────────────────────────────────────────────

function toGray(cv: Cv, src: Mat): Mat {
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  return gray;
}

function grayToRGBA(cv: Cv, gray: Mat): Mat {
  const dst = new cv.Mat();
  cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA);
  return dst;
}

function toRGB(cv: Cv, src: Mat): Mat {
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  return rgb;
}

function rgbToRGBA(cv: Cv, rgb: Mat): Mat {
  const dst = new cv.Mat();
  cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA);
  return dst;
}

// ─── Filters ────────────────────────────────────────────────────────────────

const opGaussianBlur: OpFn = (cv, src, p) => {
  const k = oddify(int(p, "ksize", 5));
  const dst = new cv.Mat();
  cv.GaussianBlur(src, dst, new cv.Size(k, k), num(p, "sigma_x", 0), 0, cv.BORDER_DEFAULT);
  return dst;
};

const opMedianBlur: OpFn = (cv, src, p) => {
  const k = oddify(int(p, "ksize", 5));
  const dst = new cv.Mat();
  cv.medianBlur(src, dst, k);
  return dst;
};

const opBilateralFilter: OpFn = (cv, src, p) => {
  // bilateralFilter does not accept 4-channel input — drop to RGB and back.
  const rgb = toRGB(cv, src);
  const filtered = new cv.Mat();
  cv.bilateralFilter(
    rgb, filtered,
    int(p, "d", 9),
    num(p, "sigma_color", 75),
    num(p, "sigma_space", 75),
    cv.BORDER_DEFAULT,
  );
  const dst = rgbToRGBA(cv, filtered);
  rgb.delete();
  filtered.delete();
  return dst;
};

const opSharpen: OpFn = (cv, src, p) => {
  const strength = num(p, "strength", 1.5);
  const center = 1 + strength * 4;
  const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
    0, -strength, 0,
    -strength, center, -strength,
    0, -strength, 0,
  ]);
  const dst = new cv.Mat();
  cv.filter2D(src, dst, -1, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT);
  kernel.delete();
  return dst;
};

// ─── Edge detection ─────────────────────────────────────────────────────────

const opCanny: OpFn = (cv, src, p) => {
  const gray = toGray(cv, src);
  const edges = new cv.Mat();
  cv.Canny(gray, edges, num(p, "threshold1", 50), num(p, "threshold2", 150), 3, false);
  const dst = grayToRGBA(cv, edges);
  gray.delete();
  edges.delete();
  return dst;
};

const opSobel: OpFn = (cv, src, p) => {
  const gray = toGray(cv, src);
  const grad = new cv.Mat();
  cv.Sobel(gray, grad, cv.CV_64F, int(p, "dx", 1), int(p, "dy", 0), int(p, "ksize", 3), 1, 0, cv.BORDER_DEFAULT);
  const abs = new cv.Mat();
  cv.convertScaleAbs(grad, abs, 1, 0);
  const dst = grayToRGBA(cv, abs);
  gray.delete();
  grad.delete();
  abs.delete();
  return dst;
};

const opLaplacian: OpFn = (cv, src, p) => {
  const k = oddify(int(p, "ksize", 3));
  const gray = toGray(cv, src);
  const lap = new cv.Mat();
  cv.Laplacian(gray, lap, cv.CV_64F, k, 1, 0, cv.BORDER_DEFAULT);
  const abs = new cv.Mat();
  cv.convertScaleAbs(lap, abs, 1, 0);
  const dst = grayToRGBA(cv, abs);
  gray.delete();
  lap.delete();
  abs.delete();
  return dst;
};

// ─── Threshold ──────────────────────────────────────────────────────────────

const opThresholdBinary: OpFn = (cv, src, p) => {
  const gray = toGray(cv, src);
  const out = new cv.Mat();
  cv.threshold(gray, out, int(p, "thresh", 127), int(p, "maxval", 255), cv.THRESH_BINARY);
  const dst = grayToRGBA(cv, out);
  gray.delete();
  out.delete();
  return dst;
};

const opThresholdOtsu: OpFn = (cv, src) => {
  const gray = toGray(cv, src);
  const out = new cv.Mat();
  cv.threshold(gray, out, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  const dst = grayToRGBA(cv, out);
  gray.delete();
  out.delete();
  return dst;
};

const opAdaptiveThreshold: OpFn = (cv, src, p) => {
  const method = str(p, "method", "gaussian") === "gaussian"
    ? cv.ADAPTIVE_THRESH_GAUSSIAN_C
    : cv.ADAPTIVE_THRESH_MEAN_C;
  const blockSize = oddify(int(p, "block_size", 11));
  const gray = toGray(cv, src);
  const out = new cv.Mat();
  cv.adaptiveThreshold(gray, out, 255, method, cv.THRESH_BINARY, blockSize, num(p, "c", 2));
  const dst = grayToRGBA(cv, out);
  gray.delete();
  out.delete();
  return dst;
};

// ─── Morphology ─────────────────────────────────────────────────────────────

function morph(cv: Cv, src: Mat, k: number, iterations: number, kind: "erode" | "dilate"): Mat {
  const kernel = cv.Mat.ones(k, k, cv.CV_8U);
  const dst = new cv.Mat();
  const anchor = new cv.Point(-1, -1);
  const op = kind === "erode" ? cv.erode : cv.dilate;
  op(src, dst, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
  kernel.delete();
  return dst;
}

const opErode: OpFn = (cv, src, p) =>
  morph(cv, src, int(p, "ksize", 3), int(p, "iterations", 1), "erode");

const opDilate: OpFn = (cv, src, p) =>
  morph(cv, src, int(p, "ksize", 3), int(p, "iterations", 1), "dilate");

function morphEx(cv: Cv, src: Mat, k: number, mode: number): Mat {
  const kernel = cv.Mat.ones(k, k, cv.CV_8U);
  const dst = new cv.Mat();
  cv.morphologyEx(src, dst, mode, kernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
  kernel.delete();
  return dst;
}

const opMorphologyOpen: OpFn = (cv, src, p) => morphEx(cv, src, int(p, "ksize", 3), cv.MORPH_OPEN);
const opMorphologyClose: OpFn = (cv, src, p) => morphEx(cv, src, int(p, "ksize", 3), cv.MORPH_CLOSE);

// ─── Color ──────────────────────────────────────────────────────────────────

const opGrayscale: OpFn = (cv, src) => {
  const gray = toGray(cv, src);
  const dst = grayToRGBA(cv, gray);
  gray.delete();
  return dst;
};

const opEqualizeHist: OpFn = (cv, src) => {
  const gray = toGray(cv, src);
  const out = new cv.Mat();
  cv.equalizeHist(gray, out);
  const dst = grayToRGBA(cv, out);
  gray.delete();
  out.delete();
  return dst;
};

const opClahe: OpFn = (cv, src, p) => {
  const gray = toGray(cv, src);
  const clahe = new cv.CLAHE(
    num(p, "clip_limit", 2.0),
    new cv.Size(int(p, "tile_grid_x", 8), int(p, "tile_grid_y", 8)),
  );
  const out = new cv.Mat();
  clahe.apply(gray, out);
  const dst = grayToRGBA(cv, out);
  clahe.delete();
  gray.delete();
  out.delete();
  return dst;
};

const opInvert: OpFn = (cv, src) => {
  // Invert RGB only — inverting the alpha channel would make the image vanish.
  const rgb = toRGB(cv, src);
  const inv = new cv.Mat();
  cv.bitwise_not(rgb, inv);
  const dst = rgbToRGBA(cv, inv);
  rgb.delete();
  inv.delete();
  return dst;
};

// ─── Geometry ───────────────────────────────────────────────────────────────

const opResize: OpFn = (cv, src, p) => {
  const dst = new cv.Mat();
  cv.resize(src, dst, new cv.Size(int(p, "width", 640), int(p, "height", 480)), 0, 0, cv.INTER_LINEAR);
  return dst;
};

const opRotate: OpFn = (cv, src, p) => {
  const w = src.cols;
  const h = src.rows;
  const center = new cv.Point(w / 2, h / 2);
  const m = cv.getRotationMatrix2D(center, num(p, "angle", 0), num(p, "scale", 1.0));
  const dst = new cv.Mat();
  cv.warpAffine(src, dst, m, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  m.delete();
  return dst;
};

const opFlip: OpFn = (cv, src, p) => {
  const code: Record<string, number> = { horizontal: 1, vertical: 0, both: -1 };
  const dst = new cv.Mat();
  cv.flip(src, dst, code[str(p, "direction", "horizontal")] ?? 1);
  return dst;
};

// ─── Denoise ────────────────────────────────────────────────────────────────

const opFastNlMeans: OpFn = (cv, src, p) => {
  if (typeof cv.fastNlMeansDenoisingColored !== "function") {
    throw new Error("Non-local means denoise is not available in this OpenCV.js build");
  }
  const rgb = toRGB(cv, src);
  const out = new cv.Mat();
  const h = num(p, "h", 10);
  cv.fastNlMeansDenoisingColored(rgb, out, h, h, int(p, "template_window", 7), int(p, "search_window", 21));
  const dst = rgbToRGBA(cv, out);
  rgb.delete();
  out.delete();
  return dst;
};

// ─── Channel operations ─────────────────────────────────────────────────────

const opChannelAdjustRgb: OpFn = (cv, src, p) => {
  const rgb = toRGB(cv, src);
  const ch = new cv.MatVector();
  cv.split(rgb, ch);
  // convertTo saturates (clips <0→0, >255→255), matching numpy's np.clip.
  ch.get(0).convertTo(ch.get(0), cv.CV_8U, num(p, "r_scale", 1), num(p, "r_offset", 0));
  ch.get(1).convertTo(ch.get(1), cv.CV_8U, num(p, "g_scale", 1), num(p, "g_offset", 0));
  ch.get(2).convertTo(ch.get(2), cv.CV_8U, num(p, "b_scale", 1), num(p, "b_offset", 0));
  const merged = new cv.Mat();
  cv.merge(ch, merged);
  const dst = rgbToRGBA(cv, merged);
  rgb.delete();
  ch.delete();
  merged.delete();
  return dst;
};

const opHsvAdjust: OpFn = (cv, src, p) => {
  const rgb = toRGB(cv, src);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV); // H:[0,180) S,V:[0,255], 8-bit
  const ch = new cv.MatVector();
  cv.split(hsv, ch);

  // Hue: (h + shift) mod 180, wrapping negatives — no cv modulo, so do it by hand.
  const shift = int(p, "hue_shift", 0);
  const hData: Uint8Array = ch.get(0).data;
  for (let i = 0; i < hData.length; i++) {
    hData[i] = (((hData[i] + shift) % 180) + 180) % 180;
  }
  // Saturation / value: scale with saturation clamp.
  ch.get(1).convertTo(ch.get(1), cv.CV_8U, num(p, "sat_scale", 1), 0);
  ch.get(2).convertTo(ch.get(2), cv.CV_8U, num(p, "val_scale", 1), 0);

  const merged = new cv.Mat();
  cv.merge(ch, merged);
  const rgbOut = new cv.Mat();
  cv.cvtColor(merged, rgbOut, cv.COLOR_HSV2RGB);
  const dst = rgbToRGBA(cv, rgbOut);
  rgb.delete();
  hsv.delete();
  ch.delete();
  merged.delete();
  rgbOut.delete();
  return dst;
};

const opExtractChannel: OpFn = (cv, src, p) => {
  const colorSpace = str(p, "color_space", "rgb");
  const idx = Math.min(Math.max(int(p, "channel", 0), 0), 2);
  const rgb = toRGB(cv, src); // R,G,B order → idx 0 = R
  let converted = rgb;
  if (colorSpace === "hsv") {
    converted = new cv.Mat();
    cv.cvtColor(rgb, converted, cv.COLOR_RGB2HSV);
    rgb.delete();
  }
  const ch = new cv.MatVector();
  cv.split(converted, ch);
  const dst = grayToRGBA(cv, ch.get(idx));
  converted.delete();
  ch.delete();
  return dst;
};

// ─── Registry — keys must match packages/core OP_REGISTRY exactly ────────────

export const JS_OP_MAP: Record<string, OpFn> = {
  gaussian_blur:      opGaussianBlur,
  median_blur:        opMedianBlur,
  bilateral_filter:   opBilateralFilter,
  sharpen:            opSharpen,
  canny:              opCanny,
  sobel:              opSobel,
  laplacian:          opLaplacian,
  threshold_binary:   opThresholdBinary,
  threshold_otsu:     opThresholdOtsu,
  adaptive_threshold: opAdaptiveThreshold,
  erode:              opErode,
  dilate:             opDilate,
  morphology_open:    opMorphologyOpen,
  morphology_close:   opMorphologyClose,
  grayscale:          opGrayscale,
  equalize_hist:      opEqualizeHist,
  clahe:              opClahe,
  invert:             opInvert,
  resize:             opResize,
  rotate:             opRotate,
  flip:               opFlip,
  fast_nl_means:      opFastNlMeans,
  channel_adjust_rgb: opChannelAdjustRgb,
  hsv_adjust:         opHsvAdjust,
  extract_channel:    opExtractChannel,
};
