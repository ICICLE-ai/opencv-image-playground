# DEPRECATED for the interactive editor: the web app now runs OpenCV in the
# browser via opencv.js (packages/playground/src/lib/opencv). This FastAPI
# bridge is kept for CLI/batch/server-side processing and is no longer called
# by apps/app-standalone.

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import cv2
import numpy as np
import base64
import json

app = FastAPI(title="cv-bridge", version="0.1.0")

# Allow the Remix dev server to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ───────────────────────────────────────────

def img_to_b64(img: np.ndarray) -> str:
    """Convert a numpy image to a base64 PNG string."""
    _, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf.tobytes()).decode()

def bytes_to_img(data: bytes) -> np.ndarray:
    """Decode uploaded image bytes into a numpy array."""
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

# ── Op implementations ────────────────────────────────

def op_gaussian_blur(img, p):
    ksize = int(p.get("ksize", 5))
    if ksize % 2 == 0:
        ksize += 1   # ksize must be odd
    return cv2.GaussianBlur(img, (ksize, ksize), float(p.get("sigma_x", 0)))

def op_canny(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, float(p.get("threshold1", 50)), float(p.get("threshold2", 150)))
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

def op_grayscale(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

def op_threshold_binary(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, result = cv2.threshold(gray, int(p.get("thresh", 127)), int(p.get("maxval", 255)), cv2.THRESH_BINARY)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)

def op_erode(img, p):
    ksize = int(p.get("ksize", 3))
    kernel = np.ones((ksize, ksize), np.uint8)
    return cv2.erode(img, kernel, iterations=int(p.get("iterations", 1)))

def op_median_blur(img, p):
    ksize = int(p.get("ksize", 5))
    if ksize % 2 == 0:
        ksize += 1
    return cv2.medianBlur(img, ksize)

def op_bilateral_filter(img, p):
    return cv2.bilateralFilter(
        img,
        int(p.get("d", 9)),
        float(p.get("sigma_color", 75)),
        float(p.get("sigma_space", 75)),
    )


def op_sharpen(img, p):
    strength = float(p.get("strength", 1.5))
    center = 1 + strength * 4
    kernel = np.array([
        [0, -strength, 0],
        [-strength, center, -strength],
        [0, -strength, 0],
    ])
    return cv2.filter2D(img, -1, kernel)


def op_sobel(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    result = cv2.Sobel(
        gray, cv2.CV_64F,
        int(p.get("dx", 1)),
        int(p.get("dy", 0)),
        ksize=int(p.get("ksize", 3)),
    )
    result = cv2.convertScaleAbs(result)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_laplacian(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    ksize = int(p.get("ksize", 3))
    if ksize % 2 == 0:
        ksize += 1
    result = cv2.Laplacian(gray, cv2.CV_64F, ksize=ksize)
    result = cv2.convertScaleAbs(result)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_threshold_otsu(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    _, result = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_adaptive_threshold(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    method_str = str(p.get("method", "gaussian"))
    method = (
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C
        if method_str == "gaussian"
        else cv2.ADAPTIVE_THRESH_MEAN_C
    )
    block_size = int(p.get("block_size", 11))
    if block_size % 2 == 0:
        block_size += 1
    result = cv2.adaptiveThreshold(
        gray, 255, method, cv2.THRESH_BINARY,
        block_size, float(p.get("c", 2)),
    )
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_morphology_open(img, p):
    ksize = int(p.get("ksize", 3))
    kernel = np.ones((ksize, ksize), np.uint8)
    return cv2.morphologyEx(img, cv2.MORPH_OPEN, kernel)


def op_morphology_close(img, p):
    ksize = int(p.get("ksize", 3))
    kernel = np.ones((ksize, ksize), np.uint8)
    return cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel)


def op_equalize_hist(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    result = cv2.equalizeHist(gray)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_clahe(img, p):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    clahe = cv2.createCLAHE(
        clipLimit=float(p.get("clip_limit", 2.0)),
        tileGridSize=(int(p.get("tile_grid_x", 8)), int(p.get("tile_grid_y", 8))),
    )
    result = clahe.apply(gray)
    return cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)


def op_invert(img, p):
    return cv2.bitwise_not(img)


def op_resize(img, p):
    return cv2.resize(
        img,
        (int(p.get("width", 640)), int(p.get("height", 480))),
    )


def op_rotate(img, p):
    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2
    M = cv2.getRotationMatrix2D(
        (cx, cy),
        float(p.get("angle", 0)),
        float(p.get("scale", 1.0)),
    )
    return cv2.warpAffine(img, M, (w, h))


def op_flip(img, p):
    direction = str(p.get("direction", "horizontal"))
    flip_code = {"horizontal": 1, "vertical": 0, "both": -1}.get(direction, 1)
    return cv2.flip(img, flip_code)


def op_fast_nl_means(img, p):
    return cv2.fastNlMeansDenoisingColored(
        img, None,
        float(p.get("h", 10)),
        float(p.get("h", 10)),
        int(p.get("template_window", 7)),
        int(p.get("search_window", 21)),
    )

def op_dilate(img, p):
    ksize = int(p.get("ksize", 3))
    kernel = np.ones((ksize, ksize), np.uint8)
    return cv2.dilate(img, kernel, iterations=int(p.get("iterations", 1)))

def op_channel_adjust_rgb(img, p):
    # OpenCV stores images as BGR, so we adjust in that order
    b, g, r = cv2.split(img.astype(np.float32))

    r = r * float(p.get("r_scale", 1)) + float(p.get("r_offset", 0))
    g = g * float(p.get("g_scale", 1)) + float(p.get("g_offset", 0))
    b = b * float(p.get("b_scale", 1)) + float(p.get("b_offset", 0))

    merged = cv2.merge([
        np.clip(b, 0, 255),
        np.clip(g, 0, 255),
        np.clip(r, 0, 255),
    ])
    return merged.astype(np.uint8)


def op_hsv_adjust(img, p):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = cv2.split(hsv)

    # Hue wraps around 0-180 in OpenCV's HSV representation
    h = (h + float(p.get("hue_shift", 0))) % 180
    s = np.clip(s * float(p.get("sat_scale", 1)), 0, 255)
    v = np.clip(v * float(p.get("val_scale", 1)), 0, 255)

    merged = cv2.merge([h, s, v]).astype(np.uint8)
    return cv2.cvtColor(merged, cv2.COLOR_HSV2BGR)


def op_extract_channel(img, p):
    color_space = str(p.get("color_space", "rgb"))
    channel_idx = int(p.get("channel", "0"))

    if color_space == "hsv":
        converted = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    else:
        converted = img  # already BGR; index 0=B,1=G,2=R in OpenCV's storage

    channels = cv2.split(converted)
    # For RGB mode we want index 0=R, so reverse the BGR order
    if color_space == "rgb":
        channels = channels[::-1]

    isolated = channels[channel_idx]
    return cv2.cvtColor(isolated, cv2.COLOR_GRAY2BGR)

# ── Registry ──────────────────────────────────────────
# Maps op key → function
# Key must match exactly what's in packages/core/src/registry.ts

OP_MAP = {
    "gaussian_blur":    op_gaussian_blur,
    "canny":            op_canny,
    "grayscale":        op_grayscale,
    "threshold_binary": op_threshold_binary,
    "erode":            op_erode,
    "gaussian_blur":      op_gaussian_blur,
    "median_blur":        op_median_blur,
    "bilateral_filter":   op_bilateral_filter,
    "sharpen":            op_sharpen,
    "canny":              op_canny,
    "sobel":              op_sobel,
    "laplacian":          op_laplacian,
    "threshold_binary":   op_threshold_binary,
    "threshold_otsu":     op_threshold_otsu,
    "adaptive_threshold": op_adaptive_threshold,
    "erode":              op_erode,
    "dilate":             op_dilate,
    "morphology_open":    op_morphology_open,
    "morphology_close":   op_morphology_close,
    "grayscale":          op_grayscale,
    "equalize_hist":      op_equalize_hist,
    "clahe":              op_clahe,
    "invert":             op_invert,
    "resize":             op_resize,
    "rotate":             op_rotate,
    "flip":               op_flip,
    "fast_nl_means":      op_fast_nl_means,
    "channel_adjust_rgb": op_channel_adjust_rgb,
    "hsv_adjust":         op_hsv_adjust,
    "extract_channel":    op_extract_channel,
}

# ── Routes ────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "opencv": cv2.__version__}


@app.post("/process")
async def process(
    image: UploadFile = File(...),
    steps: str = Form(...),   # JSON string sent from Remix
):
    # Decode the image
    image_bytes = await image.read()
    current = bytes_to_img(image_bytes)
    if current is None:
        return {"error": "Could not decode image"}, 400

    # Parse the pipeline steps
    pipeline_steps = json.loads(steps)
    results = []

    for step in pipeline_steps:
        if not step.get("enabled", True):
            # Step is disabled — pass through unchanged
            results.append({
                "id": step["id"],
                "ok": True,
                "image_b64": img_to_b64(current)
            })
            continue

        op_fn = OP_MAP.get(step["op"])
        if op_fn is None:
            results.append({
                "id": step["id"],
                "ok": False,
                "error": f"Unknown op: {step['op']}"
            })
            continue

        try:
            current = op_fn(current, step.get("params", {}))
            results.append({
                "id": step["id"],
                "ok": True,
                "image_b64": img_to_b64(current)
            })
        except Exception as e:
            results.append({
                "id": step["id"],
                "ok": False,
                "error": str(e)
            })
            # Don't update current — next step sees last good image

    return {"steps": results}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)