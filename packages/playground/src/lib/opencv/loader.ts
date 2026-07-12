// Lazily loads the opencv.js (WASM) runtime on the client.
//
// opencv.js ships as a huge UMD/emscripten bundle whose exports get mangled by
// bundler CJS→ESM interop (Vite's dep optimizer in particular). To stay robust
// across dev and prod we load it the way OpenCV intends — as a classic <script>
// that assigns `window.cv` — using a `?url` asset import so the npm package
// remains the source of the file (no manual copy into each host's public dir).

import cvScriptUrl from "@techstark/opencv-js/dist/opencv.js?url";
import type cvType from "@techstark/opencv-js";

export type CV = typeof cvType;

let cvPromise: Promise<CV> | null = null;

export function loadOpenCV(): Promise<CV> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js can only be loaded in the browser"));
  }

  if (cvPromise) return cvPromise;

  cvPromise = new Promise<CV>((resolve, reject) => {
    const finish = (cv: CV) => resolve(cv);

    // The UMD browser-globals branch sets `window.cv` to the emscripten ready
    // promise (resolves to the initialized module). Await it, then confirm the
    // API is bound; fall back to the `onRuntimeInitialized` hook / polling.
    const settle = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = (window as any).cv;
      Promise.resolve(g)
        .then((cv: any) => {
          if (cv?.Mat) return finish(cv as CV);
          if (g && "onRuntimeInitialized" in g) {
            g.onRuntimeInitialized = () => finish(g as CV);
            return;
          }
          const start = Date.now();
          const timer = setInterval(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ready: any = (window as any).cv;
            if (ready?.Mat) {
              clearInterval(timer);
              finish(ready as CV);
            } else if (Date.now() - start > 30000) {
              clearInterval(timer);
              reject(new Error("OpenCV.js runtime failed to initialize in time"));
            }
          }, 50);
        })
        .catch(reject);
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-opencv-js]");
    if (existing) {
      settle();
      return;
    }

    const script = document.createElement("script");
    script.src = cvScriptUrl;
    script.async = true;
    script.dataset.opencvJs = "true";
    script.onload = settle;
    script.onerror = () => reject(new Error("Failed to load opencv.js"));
    document.head.appendChild(script);
  });

  return cvPromise;
}
