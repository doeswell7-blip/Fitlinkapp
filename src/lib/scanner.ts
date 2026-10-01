import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

let poseLandmarker: PoseLandmarker | null = null;

const MODEL_VERSION = 'pose-landmark-v1';

export function getScanModelVersion(): string {
  return MODEL_VERSION;
}

export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (poseLandmarker) return poseLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return poseLandmarker;
}

export interface PoseDetectionResult {
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: NormalizedLandmark[] | null;
  timestamp: number;
}

export function detectPose(
  video: HTMLVideoElement,
  timestamp: number,
): PoseDetectionResult {
  if (!poseLandmarker) {
    throw new Error('PoseLandmarker not initialized. Call initPoseLandmarker() first.');
  }

  const result = poseLandmarker.detectForVideo(video, timestamp);

  if (result.landmarks && result.landmarks.length > 0) {
    return {
      landmarks: result.landmarks[0],
      worldLandmarks: result.worldLandmarks && result.worldLandmarks.length > 0
        ? result.worldLandmarks[0]
        : null,
      timestamp,
    };
  }

  return { landmarks: null, worldLandmarks: null, timestamp };
}

// --- Camera utilities ---

export interface CameraStream {
  stream: MediaStream;
  track: MediaStreamTrack;
}

export async function startCamera(): Promise<CameraStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
    audio: false,
  });

  const track = stream.getVideoTracks()[0];
  return { stream, track };
}

export function stopCamera(stream: CameraStream | null) {
  if (stream) {
    stream.stream.getTracks().forEach((t) => t.stop());
  }
}

export function getDeviceInfo(): Record<string, string> {
  const ua = navigator.userAgent;
  let os = 'unknown';
  if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
  else if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua)) os = 'linux';

  let browser = 'unknown';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'chrome';
  else if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Safari/i.test(ua)) browser = 'safari';
  else if (/Edg/i.test(ua)) browser = 'edge';

  return {
    os,
    browser,
    userAgent: ua,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    pixelRatio: String(window.devicePixelRatio),
  timestamp: new Date().toISOString(),
  };
}

// --- Capture frame from video ---
export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

// --- Draw pose skeleton overlay on canvas ---
export function drawPoseOverlay(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[] | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !landmarks) return;

  const w = canvas.width;
  const h = canvas.height;

  // Skeleton connections (pairs of landmark indices)
  const connections: [number, number][] = [
    [11, 12], // shoulders
    [11, 13], [13, 15], // left arm
    [12, 14], [14, 16], // right arm
    [11, 23], [12, 24], // torso sides
    [23, 24], // hips
    [23, 25], [25, 27], // left leg
    [24, 26], [26, 28], // right leg
    [27, 29], [29, 31], // left foot
    [28, 30], [30, 32], // right foot
    [0, 11], [0, 12], // neck
  ];

  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 8;

  for (const [a, b] of connections) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 0) < 0.3 || (lb.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  // Draw landmark points
  for (const lm of landmarks) {
    if ((lm.visibility ?? 0) < 0.3) continue;
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
