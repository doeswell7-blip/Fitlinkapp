import { useRef, useState, useEffect, useCallback } from 'react';
import {
  initPoseLandmarker,
  startCamera,
  stopCamera,
  detectPose,
  drawPoseOverlay,
  getDeviceInfo,
  captureFrame,
  type CameraStream,
} from '@/lib/scanner';
import {
  extractMeasurements,
  validateCapture,
  checkLighting,
  type CaptureValidationResult,
  type LightingCheckResult,
} from '@/lib/measurement';
import { createScanRecord, updateScanStatus, createBodyTwin } from '@/lib/data';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Button, Card, ProgressBar, Badge } from '@/components/ui';

type ScanStep = 'idle' | 'preparing' | 'camera' | 'lighting' | 'front' | 'side' | 'processing' | 'done' | 'error';

interface ScanViewProps {
  orgId: string;
  onBodyTwinCreated: (id: string) => void;
}

const STEPS = [
  { key: 'camera', label: 'Camera' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'processing', label: 'Processing' },
  { key: 'done', label: 'Complete' },
] as const;

const STEP_LABELS: Record<ScanStep, string> = {
  idle: 'Ready to scan',
  preparing: 'Initializing scanner...',
  camera: 'Requesting camera access...',
  lighting: 'Checking lighting conditions...',
  front: 'Front pose — stand facing the camera',
  side: 'Side pose — turn 90 degrees to your right',
  processing: 'Processing measurements...',
  done: 'Scan complete!',
  error: 'Scan failed',
};

const PROCESSING_MESSAGES = [
  'Analyzing body geometry...',
  'Extracting measurements...',
  'Calculating confidence...',
  'Building your Body Twin...',
];

export default function ScanView({ orgId, onBodyTwinCreated }: ScanViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<CameraStream | null>(null);
  const rafRef = useRef<number>(0);
  const scanIdRef = useRef<string | null>(null);
  const frontLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const sideLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [step, setStep] = useState<ScanStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<CaptureValidationResult | null>(null);
  const [lighting, setLighting] = useState<LightingCheckResult | null>(null);
  const [userHeight, setUserHeight] = useState('');
  const [progress, setProgress] = useState(0);
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MESSAGES[0]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopCamera(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const runPoseLoop = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const now = performance.now();
    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;

      try {
        const result = detectPose(video, now);
        const ctx = overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          if (result.landmarks) {
            drawPoseOverlay(overlay, result.landmarks);
            const v = validateCapture(result.landmarks, overlay.width, overlay.height);
            setValidation(v);
          } else {
            setValidation(null);
          }
        }
      } catch {
        // Detection can throw during init — ignore transient errors
      }
    }

    rafRef.current = requestAnimationFrame(runPoseLoop);
  }, []);

  const startScan = async () => {
    setStep('preparing');
    setError(null);
    setProgress(15);

    try {
      await initPoseLandmarker();
      setProgress(25);

      const scanId = await createScanRecord(orgId, 'rgb_camera', getDeviceInfo());
      scanIdRef.current = scanId;
      setProgress(35);

      setStep('camera');
      const camStream = await startCamera();
      streamRef.current = camStream;

      const video = videoRef.current;
      if (!video) throw new Error('Video element not available');

      video.srcObject = camStream.stream;
      await video.play();

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = video.videoWidth || 640;
        overlay.height = video.videoHeight || 480;
      }

      setProgress(45);

      // Lighting check
      setStep('lighting');
      await new Promise((r) => setTimeout(r, 1200));

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 160;
      sampleCanvas.height = 120;
      const sampleCtx = sampleCanvas.getContext('2d');
      if (sampleCtx) {
        sampleCtx.drawImage(video, 0, 0, 160, 120);
        const imgData = sampleCtx.getImageData(0, 0, 160, 120);
        const lightResult = checkLighting(imgData);
        setLighting(lightResult);
      }

      setProgress(55);
      setStep('front');
      rafRef.current = requestAnimationFrame(runPoseLoop);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start scan';
      setError(msg);
      setStep('error');
      if (scanIdRef.current) {
        await updateScanStatus(scanIdRef.current, 'failed', { error_message: msg });
      }
    }
  };

  const captureFront = () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const result = detectPose(video, performance.now());
    if (!result.landmarks) {
      setError('No person detected. Please ensure your full body is visible in the frame.');
      return;
    }

    const v = validateCapture(result.landmarks, overlay.width, overlay.height);
    if (!v.isValid) {
      setError(v.issues.join(' '));
      return;
    }

    frontLandmarksRef.current = result.landmarks;
    setProgress(70);
    setStep('side');
    setError(null);
  };

  const captureSide = () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const result = detectPose(video, performance.now());
    if (!result.landmarks) {
      setError('No person detected in side pose. Please ensure your full body is visible.');
      return;
    }

    const v = validateCapture(result.landmarks, overlay.width, overlay.height);
    if (!v.isValid) {
      setError(v.issues.join(' '));
      return;
    }

    sideLandmarksRef.current = result.landmarks;
    setProgress(80);
    processScan();
  };

  const processScan = async () => {
    setStep('processing');
    cleanup();

    const front = frontLandmarksRef.current;
    if (!front) {
      setError('Front pose data missing. Please restart the scan.');
      setStep('error');
      return;
    }

    // Cycle through processing messages
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % PROCESSING_MESSAGES.length;
      setProcessingMsg(PROCESSING_MESSAGES[msgIdx]);
    }, 1500);

    try {
      const video = videoRef.current;
      const imgW = video?.videoWidth || 640;
      const imgH = video?.videoHeight || 480;

      const heightCm = userHeight ? parseFloat(userHeight) : undefined;
      const result = extractMeasurements(front, imgW, imgH, heightCm);

      setProgress(90);

      if (!scanIdRef.current) throw new Error('Scan record missing');

      await updateScanStatus(scanIdRef.current, 'processing', {
        poses_captured: ['front', 'side'],
      });

      const bodyTwinId = await createBodyTwin(
        orgId,
        scanIdRef.current,
        result.measurements,
        result.overall_confidence,
        result.scan_quality,
        result.measurements.find((m) => m.measurement_type === 'height')?.value_cm ?? null,
        {},
        {},
      );

      clearInterval(msgInterval);
      setProgress(100);
      setStep('done');

      setTimeout(() => onBodyTwinCreated(bodyTwinId), 1500);
    } catch (err) {
      clearInterval(msgInterval);
      const msg = err instanceof Error ? err.message : 'Processing failed';
      setError(msg);
      setStep('error');
      if (scanIdRef.current) {
        await updateScanStatus(scanIdRef.current, 'failed', { error_message: msg });
      }
    }
  };

  const restart = () => {
    cleanup();
    setStep('idle');
    setError(null);
    setValidation(null);
    setLighting(null);
    setProgress(0);
    frontLandmarksRef.current = null;
    sideLandmarksRef.current = null;
    scanIdRef.current = null;
  };

  const isLive = step === 'front' || step === 'side';
  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  // Get the most important guidance message
  const guidanceMessage = (() => {
    if (!isLive || !validation) return null;
    if (validation.issues.length > 0) return validation.issues[0];
    if (validation.isValid) return 'Good positioning — ready to capture';
    return null;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Body Scan</h2>
        <p className="text-secondary text-sm">Create a digital Body Twin using your phone camera</p>
      </div>

      {/* Step indicator */}
      {step !== 'idle' && step !== 'error' && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const isComplete = i < currentStepIdx;
            const isCurrent = i === currentStepIdx;
            return (
              <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isComplete ? 'bg-success-subtle text-success' :
                  isCurrent ? 'bg-accent-subtle text-accent' :
                  'bg-secondary text-tertiary'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isComplete ? 'bg-success text-white' :
                    isCurrent ? 'bg-accent text-white' :
                    'bg-tertiary text-white'
                  }`}>
                    {isComplete ? '\u2713' : i + 1}
                  </span>
                  {s.label}
                </div>
                {i < STEPS.length - 1 && <span className="text-tertiary text-xs">{'\u2192'}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Progress bar */}
      {step !== 'idle' && (
        <ProgressBar value={progress} label={STEP_LABELS[step]} />
      )}

      {/* Pre-scan instructions */}
      {step === 'idle' && (
        <div className="space-y-4">
          <Card padding="lg">
            <h3 className="text-primary font-semibold text-sm mb-4">Before you start</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-subtle flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-primary text-sm font-medium">Good lighting</p>
                  <p className="text-tertiary text-xs">Even, natural lighting. Avoid shadows or backlight.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-subtle flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
                  </svg>
                </div>
                <div>
                  <p className="text-primary text-sm font-medium">Full body visible</p>
                  <p className="text-tertiary text-xs">Stand far enough that head and feet are in frame.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-subtle flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M20 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM2 10h20M8 3v6" />
                  </svg>
                </div>
                <div>
                  <p className="text-primary text-sm font-medium">Fitted clothing</p>
                  <p className="text-tertiary text-xs">Wear close-fitting clothes for accurate measurements.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-subtle flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-primary text-sm font-medium">Privacy first</p>
                  <p className="text-tertiary text-xs">Images are processed and not permanently stored. Your data is deletable.</p>
                </div>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="mb-4">
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Your height (optional but improves accuracy)
              </label>
              <input
                type="number"
                value={userHeight}
                onChange={(e) => setUserHeight(e.target.value)}
                placeholder="e.g. 175 (cm)"
                className="w-full px-3.5 py-2.5 bg-secondary border border-app rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <p className="text-tertiary text-xs mt-1.5">
                Providing your height calibrates all measurements. Without it, estimates use average proportions with lower confidence.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={startScan}>
              Start Body Scan
            </Button>
          </Card>
        </div>
      )}

      {/* Camera view */}
      {(isLive || step === 'processing') && (
        <div className="relative surface rounded-xl overflow-hidden">
          <div className="relative aspect-[3/4] max-h-[65vh] mx-auto">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />

            {/* Framing guide overlay */}
            {isLive && (
              <div className="absolute inset-0 pointer-events-none">
                <div className={`absolute inset-8 border-2 border-dashed rounded-2xl transition-colors ${
                  validation?.isValid ? 'border-success/40' : 'border-accent/30'
                }`} />
              </div>
            )}

            {/* Guidance message */}
            {isLive && guidanceMessage && (
              <div className="absolute bottom-4 left-4 right-4">
                <div className={`px-4 py-2.5 rounded-xl text-sm font-medium text-center backdrop-blur-md ${
                  validation?.isValid
                    ? 'bg-success/20 text-success border border-success/30'
                    : 'bg-warning/20 text-warning border border-warning/30'
                }`}>
                  {guidanceMessage}
                </div>
              </div>
            )}

            {/* Lighting warning */}
            {isLive && lighting && !lighting.isGood && (
              <div className="absolute top-4 left-4 right-4">
                <div className="bg-warning/20 border border-warning/30 rounded-xl px-3 py-2 text-warning text-xs backdrop-blur-md">
                  {lighting.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing state */}
      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 border-2 border-app border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-primary text-sm font-medium">{processingMsg}</p>
        </div>
      )}

      {/* Capture buttons */}
      {step === 'front' && (
        <Button
          size="lg"
          className="w-full"
          onClick={captureFront}
          disabled={!validation?.isValid}
        >
          Capture Front Pose
        </Button>
      )}
      {step === 'side' && (
        <Button
          size="lg"
          className="w-full"
          onClick={captureSide}
          disabled={!validation?.isValid}
        >
          Capture Side Pose
        </Button>
      )}

      {/* Error */}
      {error && step === 'error' && (
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-error-subtle flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-primary text-sm font-medium mb-1">Scan failed</p>
              <p className="text-secondary text-sm">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-success-subtle flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-primary text-lg font-semibold">Body Twin Created</p>
          <p className="text-tertiary text-sm mt-1">Loading your measurements...</p>
        </div>
      )}

      {/* Restart */}
      {(step === 'error' || step === 'done') && (
        <Button variant="secondary" className="w-full" onClick={restart}>
          Start New Scan
        </Button>
      )}
    </div>
  );
}
