import * as ort from 'onnxruntime-web';

const MODEL_URL = 'https://huggingface.co/onnx-community/raft-small/resolve/main/raft-small.onnx';
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';

ort.env.wasm.wasmPaths = WASM_BASE;
ort.env.wasm.numThreads = Math.min(4, typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2);
orth.env.wasm.simd = true;

let sessionPromise: Promise<ort.InferenceSession> | null = null;

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
};

const toTensor = (image: ImageData) => {
  const { data, width, height } = image;
  const hw = width * height;
  const chw = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i++) {
    const base = i * 4;
    const r = data[base] / 255;
    const g = data[base + 1] / 255;
    const b = data[base + 2] / 255;
    chw[i] = r;
    chw[hw + i] = g;
    chw[2 * hw + i] = b;
  }
  return new ort.Tensor('float32', chw, [1, 3, height, width]);
};

const stackPair = (a: ort.Tensor<'float32'>, b: ort.Tensor<'float32'>) => {
  const [, , height, width] = a.dims;
  const combined = new Float32Array(a.data.length + b.data.length);
  combined.set(a.data as Float32Array, 0);
  combined.set(b.data as Float32Array, a.data.length);
  return new ort.Tensor('float32', combined, [1, 6, height, width]);
};

const loadSession = async () => {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      executionMode: 'parallel',
      enableMemPattern: true,
      enableCpuMemArena: true
    });
  }
  return sessionPromise;
};

const runRaft = async (prev: ImageData, curr: ImageData) => {
  const session = await loadSession();
  const a = toTensor(prev);
  const b = toTensor(curr);
  const inputs: Record<string, ort.Tensor> = {};
  if (session.inputNames.length >= 2) {
    inputs[session.inputNames[0]] = a;
    inputs[session.inputNames[1]] = b;
  } else {
    inputs[session.inputNames[0]] = stackPair(a, b);
  }
  const outputName = session.outputNames[0];
  const outputs = await session.run(inputs);
  return outputs[outputName] as ort.Tensor<'float32'>;
};

const sampleMagnitude = (flow: ort.Tensor<'float32'>) => {
  const dims = flow.dims;
  const h = dims[dims.length - 2];
  const w = dims[dims.length - 1];
  const hw = h * w;
  const data = flow.data as Float32Array;
  const stride = Math.max(1, Math.floor(w / 32));
  const mags: number[] = [];
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const idx = y * w + x;
      const fx = data[idx];
      const fy = data[hw + idx];
      mags.push(Math.hypot(fx, fy));
    }
  }
  return {
    median: percentile(mags, 0.5),
    p90: percentile(mags, 0.9),
    max: mags.length ? Math.max(...mags) : 0
  };
};

const drawFlowOverlay = (
  flow: ort.Tensor<'float32'>,
  canvas?: HTMLCanvasElement | null,
  magnitudeScale = 6
) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dims = flow.dims;
  const h = dims[dims.length - 2];
  const w = dims[dims.length - 1];
  const hw = h * w;
  const data = flow.data as Float32Array;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const stride = Math.max(1, Math.floor(w / 28));
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const idx = y * w + x;
      const fx = data[idx];
      const fy = data[hw + idx];
      const mag = Math.hypot(fx, fy);
      if (mag < 0.01) continue;
      const startX = (x / w) * canvas.width;
      const startY = (y / h) * canvas.height;
      const endX = startX + fx * magnitudeScale;
      const endY = startY + fy * magnitudeScale;
      ctx.strokeStyle = mag > 1.5 ? 'rgba(244, 63, 94, 0.85)' : 'rgba(56, 189, 248, 0.9)';
      ctx.lineWidth = mag > 1.5 ? 2 : 1.25;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }
};

export interface FlowAnalysisOptions {
  video: HTMLVideoElement;
  overlay?: HTMLCanvasElement | null;
  metersPerPixel?: number;
  fpsHint?: number;
  sampleEveryMs?: number;
  maxPairs?: number;
  targetWidth?: number;
}

export interface FlowAnalysisResult {
  velocities: number[];
  average: number;
  p95: number;
  max: number;
  framesUsed: number;
  dtStats: { mean: number; min: number; max: number };
}

const waitForSeek = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    const handler = () => {
      video.removeEventListener('seeked', handler);
      clearTimeout(timeoutId);
      resolve();
    };
    const fail = () => {
      video.removeEventListener('seeked', handler);
      clearTimeout(timeoutId);
      reject(new Error('Video seek timeout'));
    };
    video.addEventListener('seeked', handler, { once: true });
    const timeoutId = window.setTimeout(fail, 4000);
  });

const ensureMetadata = (video: HTMLVideoElement) =>
  new Promise<void>((resolve) => {
    if (!Number.isNaN(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    const handler = () => {
      video.removeEventListener('loadedmetadata', handler);
      resolve();
    };
    video.addEventListener('loadedmetadata', handler, { once: true });
  });

export const analyzeVideoWithRaft = async (
  options: FlowAnalysisOptions
): Promise<FlowAnalysisResult> => {
  const {
    video,
    overlay,
    metersPerPixel = 0.01,
    fpsHint = 24,
    sampleEveryMs = 120,
    maxPairs = 24,
    targetWidth = 384
  } = options;

  if (!video) throw new Error('Video element not available');
  await ensureMetadata(video);
  await loadSession();

  const targetHeight = Math.max(1, Math.round((video.videoHeight || 720) * (targetWidth / (video.videoWidth || 1280))));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  if (overlay) {
    overlay.width = overlay.clientWidth || overlay.width;
    overlay.height = overlay.clientHeight || overlay.height;
    const ctxOverlay = overlay.getContext('2d');
    ctxOverlay?.clearRect(0, 0, overlay.width, overlay.height);
  }

  const originalTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();

  const stepSeconds = Math.max(sampleEveryMs / 1000, 1 / Math.max(1, fpsHint));
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : stepSeconds * (maxPairs + 2);

  const captureAt = async (time: number) => {
    video.currentTime = Math.min(duration, time);
    await waitForSeek(video);
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  };

  let previous: ImageData | null = null;
  let previousTime = 0;
  const velocities: number[] = [];
  const dts: number[] = [];

  for (let i = 0; i < maxPairs + 1; i++) {
    const currentTime = Math.min(duration, i * stepSeconds);
    const frame = await captureAt(currentTime);
    if (previous) {
      const dt = Math.max(1 / Math.max(1, fpsHint), currentTime - previousTime);
      const flow = await runRaft(previous, frame);
      const { p90 } = sampleMagnitude(flow);
      const velocity = (p90 * metersPerPixel) / dt;
      velocities.push(velocity);
      dts.push(dt);
      drawFlowOverlay(flow, overlay, 6);
    }
    previous = frame;
    previousTime = currentTime;
  }

  if (!wasPaused) {
    try {
      await video.play();
    } catch {
      // ignore resume failure
    }
  }
  video.currentTime = originalTime;

  const average = velocities.length ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
  const dtMean = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;

  return {
    velocities,
    average,
    p95: percentile(velocities, 0.95),
    max: velocities.length ? Math.max(...velocities) : 0,
    framesUsed: velocities.length,
    dtStats: {
      mean: dtMean,
      min: dts.length ? Math.min(...dts) : 0,
      max: dts.length ? Math.max(...dts) : 0
    }
  };
};
