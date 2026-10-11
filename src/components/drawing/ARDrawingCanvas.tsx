import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DrawingItem, DrawingResult, StudentProfile } from '../../types';
import { handTrackingService, HandData, PinchSensitivity } from '../../services/handTrackingService';
import { audioService } from '../../services/audioService';
import { drawingEngineService, ImageAnalysisResult, GUIDE_LINE_COLORS, GuideColorOption } from '../../services/drawingEngineService';
import { googleSheetsService } from '../../services/googleSheetsService';
import confetti from 'canvas-confetti';
import {
  Camera,
  MousePointer,
  Volume2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sun,
  ChevronRight,
  Palette,
  Award,
  Star,
  Activity,
  PenTool,
  Sparkles,
  Sliders,
  Play
} from 'lucide-react';
import { HandCalibrationModal } from '../HandCalibrationModal';

interface ARDrawingCanvasProps {
  drawing: DrawingItem;
  student: StudentProfile;
  onBack: () => void;
  onComplete?: (result: DrawingResult) => void;
}

const PALETTE_COLORS = [
  { name: 'أخضر متوهج', hex: '#10b981', ring: 'ring-emerald-400' },
  { name: 'أحمر قرمزي', hex: '#ef4444', ring: 'ring-rose-500' },
  { name: 'أزرق سماوي', hex: '#0284c7', ring: 'ring-sky-400' },
  { name: 'أصفر ذهبي', hex: '#f59e0b', ring: 'ring-amber-400' },
  { name: 'بنفسجي ملكي', hex: '#8b5cf6', ring: 'ring-purple-400' },
  { name: 'برتقالي مشرق', hex: '#f97316', ring: 'ring-orange-400' }
];

export type DrawingGestureMode =
  | 'three_finger_latch'
  | 'three_finger'
  | 'two_finger_latch'
  | 'two_finger'
  | 'index_continuous';

export const ARDrawingCanvas: React.FC<ARDrawingCanvasProps> = ({
  drawing,
  student,
  onBack,
  onComplete
}) => {
  // Input mode
  const [inputMode, setInputMode] = useState<'ar_hand' | 'mouse_touch'>('ar_hand');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [showVideoFeed, setShowVideoFeed] = useState(true);
  const [brightness, setBrightness] = useState<number>(1.5);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);

  // Camera resolution & aspect ratio (Guarantees zero skeleton offset with real hand)
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number; aspect: number }>({
    width: 700,
    height: 520,
    aspect: 700 / 520
  });

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      setVideoDimensions({
        width: vw,
        height: vh,
        aspect: vw / vh
      });
    }
  };

  // Gesture Drawing Mode (Default: Smart 3-Finger Latch 🔒✍️ as requested!)
  const [gestureMode, setGestureMode] = useState<DrawingGestureMode>('three_finger_latch');
  const [isPenDown, setIsPenDown] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [sensitivity, setSensitivity] = useState<PinchSensitivity>('easy');

  // Drawing Session State (Unified Start / Finish Button 🟢/🔴)
  const [isDrawingSessionActive, setIsDrawingSessionActive] = useState(false);
  const isDrawingSessionActiveRef = useRef(false);
  isDrawingSessionActiveRef.current = isDrawingSessionActive;

  // In-Canvas Virtual Action Button Hand Tracking
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [buttonClickFeedback, setButtonClickFeedback] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastButtonTriggerRef = useRef(0);
  const lastGesturePinchTimeRef = useRef(0);
  const dwellStartTimeRef = useRef<number | null>(null);
  const airPinchStartTimeRef = useRef<number | null>(null);
  const threeFingerJoinStartTimeRef = useRef<number | null>(null);
  const pinchMustReleaseRef = useRef<boolean>(false);
  const handleToggleButtonSessionRef = useRef<() => void>(() => {});

  // Drawing state
  const [brushColor, setBrushColor] = useState(drawing.mode === 'color' ? '#ef4444' : '#10b981');
  const [brushSize, setBrushSize] = useState(drawing.mode === 'color' ? 28 : 18);
  const [opacity, setOpacity] = useState(drawing.opacity);
  // Guide line color for AR canvas (Default: Neon Yellow for high contrast against dark video feeds!)
  const [guideColor, setGuideColor] = useState<'yellow' | 'green' | 'white' | 'cyan' | 'black'>(
    drawing.guideColor || 'yellow'
  );

  // Scoring & Stats
  const [accuracy, setAccuracy] = useState<number>(0);
  const [coverage, setCoverage] = useState<number>(0);
  const [isFinished, setIsFinished] = useState(false);
  const isFinishedRef = useRef(false);
  const [attempts, setAttempts] = useState(1);
  const startTimeRef = useRef(Date.now());

  // Refs for tracking and canvases
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userDrawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // State Refs to prevent 60FPS loop stale closures
  const isPenDownRef = useRef(false);
  const gestureModeRef = useRef<DrawingGestureMode>('three_finger_latch');
  gestureModeRef.current = gestureMode;

  // Analysis Mask
  const analysisRef = useRef<ImageAnalysisResult | null>(null);
  const coveredSetRef = useRef<Set<number>>(new Set());
  const onTargetSamplesRef = useRef(0);
  const totalSamplesRef = useRef(0);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseDownRef = useRef(false);

  // Hand tracking update callback ref
  const handleHandUpdateRef = useRef<(data: HandData) => void>(() => {});

  // Render guide lines to guide canvas
  const renderGuide = useCallback((colorId: string, op: number) => {
    if (!guideCanvasRef.current || !analysisRef.current) return;
    const colorOpt = GUIDE_LINE_COLORS.find(c => c.id === colorId) || GUIDE_LINE_COLORS[0];
    drawingEngineService.renderGuideToCanvas(
      guideCanvasRef.current,
      analysisRef.current.targetMask,
      analysisRef.current.width,
      analysisRef.current.height,
      colorOpt.hex,
      op
    );
  }, []);

  // Update guide canvas when color or opacity changes
  useEffect(() => {
    renderGuide(guideColor, opacity);
  }, [guideColor, opacity, renderGuide]);

  // Load and analyze the image template
  useEffect(() => {
    let mounted = true;

    const analyze = async () => {
      try {
        const targetW = videoDimensions.width || 700;
        const targetH = videoDimensions.height || 520;
        const result = await drawingEngineService.loadAndAnalyzeImage(drawing.imageUrl, targetW, targetH);
        if (mounted) {
          analysisRef.current = result;
          clearCanvas();
          if (guideCanvasRef.current) {
            const colorOpt = GUIDE_LINE_COLORS.find(c => c.id === guideColor) || GUIDE_LINE_COLORS[0];
            drawingEngineService.renderGuideToCanvas(
              guideCanvasRef.current,
              result.targetMask,
              result.width,
              result.height,
              colorOpt.hex,
              opacity
            );
          }
        }
      } catch (err) {
        console.warn('Image analysis notice:', err);
      }
    };

    analyze();

    if (drawing.arabicAudioText) {
      setTimeout(() => audioService.speakArabic(drawing.arabicAudioText!), 500);
    }

    return () => {
      mounted = false;
    };
  }, [drawing.id, drawing.imageUrl, videoDimensions.width, videoDimensions.height]);

  // Synchronize gesture mode and sensitivity with handTrackingService
  useEffect(() => {
    handTrackingService.setDrawingGestureMode(gestureMode);
    handTrackingService.setSensitivity(sensitivity);
  }, [gestureMode, sensitivity]);

  // Setup AR Camera
  useEffect(() => {
    let mounted = true;

    const startAR = async () => {
      if (inputMode !== 'ar_hand' || !videoRef.current) return;
      setIsCameraStarting(true);
      setCameraError(null);

      handTrackingService.setBrightnessMultiplier(brightness);
      handTrackingService.setSensitivity(sensitivity);
      handTrackingService.setDrawingGestureMode(gestureMode);

      const res = await handTrackingService.startTracking(videoRef.current, (data: HandData) => {
        if (!mounted) return;
        handleHandUpdateRef.current(data);
      });

      if (res.success && videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        setVideoDimensions({
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
          aspect: videoRef.current.videoWidth / videoRef.current.videoHeight
        });
      }

      if (!res.success) {
        setCameraError(res.error || 'تعذر تشغيل الكاميرا');
        setInputMode('mouse_touch');
      }
      setIsCameraStarting(false);
    };

    if (inputMode === 'ar_hand') {
      startAR();
    } else {
      handTrackingService.stopTracking();
    }

    return () => {
      mounted = false;
      handTrackingService.stopTracking();
    };
  }, [inputMode, brightness]);

  // Trigger Success
  const triggerSuccess = useCallback((finalAccuracy: number) => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    setIsFinished(true);
    isDrawingSessionActiveRef.current = false;
    setIsDrawingSessionActive(false);
    audioService.playSuccessSound();

    try {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignore confetti error
    }

    const duration = Math.max(5, Math.round((Date.now() - startTimeRef.current) / 1000));
    const earnedScore = Math.round((drawing.points * finalAccuracy) / 100);

    const resultRecord: DrawingResult = {
      id: 'draw_' + Date.now(),
      studentId: student.id,
      studentName: student.name,
      drawingId: drawing.id,
      drawingTitle: drawing.title,
      mode: drawing.mode,
      accuracy: finalAccuracy,
      score: earnedScore,
      attempts,
      timestamp: new Date().toISOString(),
      durationSeconds: duration
    };

    // Save and queue to Google Sheets "ورقة_الرسم"
    googleSheetsService.enqueueDrawingResult(resultRecord);

    if (onComplete) {
      onComplete(resultRecord);
    }
  }, [attempts, drawing, onComplete, student]);

  // Unified Toggle: Start Drawing / Finish Drawing
  const handleToggleButtonSession = useCallback(() => {
    const now = Date.now();
    if (now - lastButtonTriggerRef.current < 2000) {
      return; // Cooldown 2s to prevent rapid start/stop cycling
    }
    lastButtonTriggerRef.current = now;
    dwellStartTimeRef.current = null;
    airPinchStartTimeRef.current = null;
    setDwellProgress(0);

    if (!isDrawingSessionActiveRef.current) {
      // 1. START SESSION
      isDrawingSessionActiveRef.current = true;
      setIsDrawingSessionActive(true);
      startTimeRef.current = Date.now();
      setButtonClickFeedback(true);
      setTimeout(() => setButtonClickFeedback(false), 500);
      audioService.playChime();
      audioService.speakArabic('تم بدء جلسة الرسم! ضم الأصابع الثلاثة وابدأ التلوين');
    } else {
      // 2. FINISH SESSION
      isDrawingSessionActiveRef.current = false;
      setIsDrawingSessionActive(false);
      setButtonClickFeedback(true);
      setTimeout(() => setButtonClickFeedback(false), 500);
      triggerSuccess(accuracy || 75);
    }
  }, [accuracy, triggerSuccess]);

  handleToggleButtonSessionRef.current = handleToggleButtonSession;

  // Clear canvas and reset progress
  const clearCanvas = () => {
    if (userDrawCanvasRef.current) {
      const ctx = userDrawCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, userDrawCanvasRef.current.width, userDrawCanvasRef.current.height);
    }
    coveredSetRef.current.clear();
    onTargetSamplesRef.current = 0;
    totalSamplesRef.current = 0;
    lastDrawPosRef.current = null;
    setCoverage(0);
    setAccuracy(0);
    setIsFinished(false);
    isFinishedRef.current = false;
  };

  // Check pixel hit and calculate real-time steadiness
  const processDrawPoint = useCallback((pixelX: number, pixelY: number) => {
    // Only draw if session is explicitly active and not finished
    if (!isDrawingSessionActiveRef.current || isFinishedRef.current || !analysisRef.current || !userDrawCanvasRef.current) return;

    if (lastDrawPosRef.current) {
      const dx = pixelX - lastDrawPosRef.current.x;
      const dy = pixelY - lastDrawPosRef.current.y;
      if (dx * dx + dy * dy < 4) {
        return; // Ignore micro-jitter under 2px
      }
    }

    const { width, height, targetMask, totalTargetPixels } = analysisRef.current;
    const ctx = userDrawCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw stroke
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = brushColor;

    if (lastDrawPosRef.current) {
      ctx.beginPath();
      ctx.moveTo(lastDrawPosRef.current.x, lastDrawPosRef.current.y);
      ctx.lineTo(pixelX, pixelY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = brushColor;
      ctx.fill();
    }

    lastDrawPosRef.current = { x: pixelX, y: pixelY };

    // Check hit radius
    const radius = drawingEngineService.getToleranceRadius(drawing.tolerance);
    let hitFound = false;

    const startX = Math.max(0, Math.floor(pixelX - radius));
    const endX = Math.min(width - 1, Math.ceil(pixelX + radius));
    const startY = Math.max(0, Math.floor(pixelY - radius));
    const endY = Math.min(height - 1, Math.ceil(pixelY + radius));

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dist = Math.hypot(x - pixelX, y - pixelY);
        if (dist <= radius) {
          const index = y * width + x;
          if (targetMask[index] === 1) {
            coveredSetRef.current.add(index);
            hitFound = true;
          }
        }
      }
    }

    totalSamplesRef.current++;
    if (hitFound) {
      onTargetSamplesRef.current++;
    }

    // Calculate coverage and steadiness
    const currentCovered = coveredSetRef.current.size;
    const covRatio = Math.min(100, Math.round((currentCovered / totalTargetPixels) * 100));
    setCoverage(covRatio);

    const steadiness = totalSamplesRef.current > 0
      ? Math.round((onTargetSamplesRef.current / totalSamplesRef.current) * 100)
      : 100;

    // Composite accuracy score
    const currentAccuracy = Math.min(100, Math.round(covRatio * 0.7 + steadiness * 0.3));
    setAccuracy(currentAccuracy);

    // NOTE: Auto-termination removed! User stays in full control and finishes when clicking the button.
  }, [brushColor, brushSize, drawing.tolerance]);

  // Hand update callback
  const handleHandUpdate = useCallback((data: HandData) => {
    if (!containerRef.current || !analysisRef.current) return;

    const currentMode = gestureModeRef.current;
    const hasHand = !!data.indexTip && !!data.landmarks && data.landmarks.length >= 21;
    setHandDetected(hasHand);

    if (!hasHand) {
      if (isPenDownRef.current) {
        isPenDownRef.current = false;
        setIsPenDown(false);
      }
      setIsHoveringButton(false);
      lastDrawPosRef.current = null;
      if (skeletonCanvasRef.current) {
        const cvs = skeletonCanvasRef.current;
        const ctx = cvs.getContext('2d');
        ctx?.clearRect(0, 0, cvs.width, cvs.height);
      }
      return;
    }

    // 1. Hit-test the in-canvas Start/Finish action button
    let isOverActionButton = false;
    if (actionButtonRef.current && data.indexTip) {
      const btn = actionButtonRef.current;
      const btnRect = btn.getBoundingClientRect();
      const cvs = skeletonCanvasRef.current || userDrawCanvasRef.current;
      if (cvs) {
        const cvsRect = cvs.getBoundingClientRect();
        // Since both video and canvas fill the exact same container with aspect-contain:
        const tipScreenX = cvsRect.left + data.indexTip.x * cvsRect.width;
        const tipScreenY = cvsRect.top + data.indexTip.y * cvsRect.height;

        // Generous touch margin around the button
        isOverActionButton = (
          tipScreenX >= btnRect.left - 25 &&
          tipScreenX <= btnRect.right + 25 &&
          tipScreenY >= btnRect.top - 25 &&
          tipScreenY <= btnRect.bottom + 25
        );
      }
      setIsHoveringButton(isOverActionButton);
    } else {
      setIsHoveringButton(false);
    }

    // Reset pinch release guard when student opens fingers
    if (!data.isPinching) {
      pinchMustReleaseRef.current = false;
    }

    const now = Date.now();
    const canTriggerButton = (now - lastButtonTriggerRef.current > 1800) && !pinchMustReleaseRef.current;

    // Interaction A: Over Action Button (2-finger pinch or 0.7s dwell inside the video)
    if (isOverActionButton) {
      const isTwoFingerPinchOverBtn = (data.isPinching || data.isTwoFingerOnlyPinch);
      if (isTwoFingerPinchOverBtn && canTriggerButton) {
        dwellStartTimeRef.current = null;
        setDwellProgress(100);
        setButtonClickFeedback(true);
        pinchMustReleaseRef.current = true;
        lastButtonTriggerRef.current = now;
        setTimeout(() => setButtonClickFeedback(false), 500);
        audioService.playPopSound();
        handleToggleButtonSessionRef.current();
      } else if (!dwellStartTimeRef.current) {
        dwellStartTimeRef.current = now;
      } else {
        const elapsed = now - dwellStartTimeRef.current;
        const progress = Math.min(100, Math.round((elapsed / 700) * 100)); // 0.7s dwell
        setDwellProgress(progress);
        if (elapsed >= 700 && canTriggerButton) {
          dwellStartTimeRef.current = null;
          setDwellProgress(0);
          setButtonClickFeedback(true);
          pinchMustReleaseRef.current = true;
          lastButtonTriggerRef.current = now;
          setTimeout(() => setButtonClickFeedback(false), 500);
          audioService.playPopSound();
          handleToggleButtonSessionRef.current();
        }
      }
    } else {
      dwellStartTimeRef.current = null;
      setDwellProgress(0);
    }

    // Interaction B: Air Pinch Gesture (Only when NOT over button)
    // When session is NOT active: 2-finger pinch held for 1.0s starts session
    // When session IS active: Air-pinch is disabled to completely prevent conflict with drawing!
    if (!isOverActionButton) {
      if (!isDrawingSessionActiveRef.current) {
        if (data.isTwoFingerOnlyPinch && canTriggerButton) {
          if (!airPinchStartTimeRef.current) {
            airPinchStartTimeRef.current = now;
          } else {
            const elapsed = now - airPinchStartTimeRef.current;
            const progress = Math.min(100, Math.round((elapsed / 1000) * 100)); // Exactly 1.0s (1000ms)
            setDwellProgress(progress);
            if (elapsed >= 1000) {
              airPinchStartTimeRef.current = null;
              setDwellProgress(0);
              setButtonClickFeedback(true);
              setTimeout(() => setButtonClickFeedback(false), 500);
              audioService.playPopSound();
              handleToggleButtonSessionRef.current();
            }
          }
        } else {
          airPinchStartTimeRef.current = null;
          if (!isOverActionButton) {
            setDwellProgress(0);
          }
        }
      } else {
        airPinchStartTimeRef.current = null;
      }
    }

    // 2. Determine if drawing is currently active:
    // Session MUST be active, and hand NOT over the button!
    // As requested:
    // "و في الرسم ثلاث اصابع الابهام و السبابة و الموسطى اذا اجتمع ثلاث اصابع في ثانية واحدة يبدا الرسم و لا يينتهي حتى اذا اختفى اصبع اما الكاميرا لا يتوقف الرسم .. اذا تباعد الاصبع بوضوح يتوقف الرسم"
    let isDrawing = isPenDownRef.current;
    if (isDrawingSessionActiveRef.current && !isOverActionButton) {
      if (!isPenDownRef.current) {
        // Condition to START drawing: 3 fingers meet in pen grip
        const isThreeFingersTogether = (
          data.isThreeFingerPinching ||
          data.isLatched ||
          (data.threeFingerSpread < 0.085 && data.threeFingerRatio < 0.45)
        );

        if (isThreeFingersTogether) {
          if (!threeFingerJoinStartTimeRef.current) {
            threeFingerJoinStartTimeRef.current = now;
          } else {
            const elapsed = now - threeFingerJoinStartTimeRef.current;
            if (elapsed >= 350) { // Gathered and stabilized
              isDrawing = true;
              threeFingerJoinStartTimeRef.current = null;
            }
          }
        } else {
          threeFingerJoinStartTimeRef.current = null;
        }
      } else {
        // While DRAWING:
        // Drawing remains locked ON! Even if one finger momentarily flickers or drops, drawing continues!
        // ONLY stops when fingers are CLEARLY and WIDELY spread apart:
        const isFingersClearlySeparated = (
          data.threeFingerSpread > 0.12 &&
          data.pinchDistance > 0.14
        ) || data.gesture === 'open_hand';

        if (isFingersClearlySeparated) {
          isDrawing = false;
          threeFingerJoinStartTimeRef.current = null;
        } else {
          isDrawing = true; // Maintain stroke continuity
        }
      }
    } else {
      isDrawing = false;
      threeFingerJoinStartTimeRef.current = null;
    }

    // Trigger state change & subtle tactile chime on pen down
    if (isDrawing !== isPenDownRef.current) {
      isPenDownRef.current = isDrawing;
      setIsPenDown(isDrawing);
      if (isDrawing) {
        audioService.playChime();
        lastDrawPosRef.current = null; // Clean start for new stroke
      } else {
        lastDrawPosRef.current = null;
      }
    }

    // 3. Draw hand skeleton & pen indicators
    if (skeletonCanvasRef.current && data.landmarks) {
      const cvs = skeletonCanvasRef.current;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4],
          [0, 5], [5, 6], [6, 7], [7, 8],
          [0, 9], [9, 10], [10, 11], [11, 12],
          [0, 13], [13, 14], [14, 15], [15, 16],
          [0, 17], [17, 18], [18, 19], [19, 20],
          [5, 9], [9, 13], [13, 17]
        ];

        // Draw bone lines
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = isOverActionButton
          ? '#38bdf8'
          : isDrawing
          ? '#10b981'
          : 'rgba(245, 158, 11, 0.45)';
        connections.forEach(([i, j]) => {
          const p1 = data.landmarks![i];
          const p2 = data.landmarks![j];
          if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x * cvs.width, p1.y * cvs.height);
            ctx.lineTo(p2.x * cvs.width, p2.y * cvs.height);
            ctx.stroke();
          }
        });

        // 3-Finger Pen Grip Triangle (Thumb 4 + Index 8 + Middle 12)
        if (data.landmarks[4] && data.landmarks[8] && data.landmarks[12]) {
          const pThumb = data.landmarks[4];
          const pIndex = data.landmarks[8];
          const pMiddle = data.landmarks[12];

          ctx.beginPath();
          ctx.moveTo(pThumb.x * cvs.width, pThumb.y * cvs.height);
          ctx.lineTo(pIndex.x * cvs.width, pIndex.y * cvs.height);
          ctx.lineTo(pMiddle.x * cvs.width, pMiddle.y * cvs.height);
          ctx.closePath();

          if (data.isThreeFingerPinching && isDrawingSessionActiveRef.current && !isOverActionButton) {
            // Active 3-Finger Pen Grip ✍️
            ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
            ctx.fill();
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = '#10b981';
            ctx.stroke();
          } else if (currentMode === 'three_finger') {
            // Open 3 fingers (Pen lifted / Idle moving)
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Highlight fingertips with distinct colors
        // Thumb (4) - Amber
        if (data.thumbTip) {
          const px = data.thumbTip.x * cvs.width;
          const py = data.thumbTip.y * cvs.height;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
        }
        // Middle (12) - Cyan
        if (data.middleTip) {
          const px = data.middleTip.x * cvs.width;
          const py = data.middleTip.y * cvs.height;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#06b6d4';
          ctx.fill();
        }
        // Index (8) - Sky Blue
        if (data.indexTip) {
          const px = data.indexTip.x * cvs.width;
          const py = data.indexTip.y * cvs.height;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
        }

        // Special Cursor when Hovering Over In-Canvas Button
        if (isOverActionButton && data.indexTip) {
          const px = data.indexTip.x * cvs.width;
          const py = data.indexTip.y * cvs.height;

          // Glowing target ring
          ctx.beginPath();
          ctx.arc(px, py, 22, 0, Math.PI * 2);
          ctx.strokeStyle = data.isPinching ? '#10b981' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Action Cue Label
          ctx.font = 'bold 12px Cairo, sans-serif';
          ctx.fillStyle = data.isPinching ? '#10b981' : '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(
            data.isPinching ? 'تم النقر! ✨' : 'اقبض بإصبعين 🤏',
            px,
            py - 28
          );
        } else {
          // Normal Pen Tip Cursor Rendering (Uses resilient activeDrawPoint if finger is occluded)
          const activePoint =
            data.activeDrawPoint ||
            (currentMode.includes('three_finger') && data.threeFingerCentroid) ||
            data.indexTip;

          if (activePoint) {
            const px = activePoint.x * cvs.width;
            const py = activePoint.y * cvs.height;

            if (isDrawing) {
              // Glow effect around active pen nib
              ctx.beginPath();
              ctx.arc(px, py, 14, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
              ctx.fill();

              ctx.beginPath();
              ctx.arc(px, py, 8, 0, Math.PI * 2);
              ctx.fillStyle = brushColor;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3;
              ctx.fill();
              ctx.stroke();
            } else {
              // Hovering dashed pen ring (Pen Lifted)
              ctx.beginPath();
              ctx.arc(px, py, 12, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
              ctx.setLineDash([4, 4]);
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.beginPath();
              ctx.arc(px, py, 3.5, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
          }
        }
      }
    }

    // IF NOT DRAWING: Release pen position and DO NOT modify canvas!
    if (!isDrawing) {
      lastDrawPosRef.current = null;
      return;
    }

    // IF DRAWING: Map normalized hand position to user drawing canvas
    if (userDrawCanvasRef.current) {
      const activePoint =
        data.activeDrawPoint ||
        (currentMode.includes('three_finger') && data.threeFingerCentroid) ||
        data.indexTip;

      if (activePoint) {
        const px = activePoint.x * userDrawCanvasRef.current.width;
        const py = activePoint.y * userDrawCanvasRef.current.height;
        processDrawPoint(px, py);
      }
    }
  }, [brushColor, processDrawPoint]);

  handleHandUpdateRef.current = handleHandUpdate;

  // Mouse & Touch Fallback
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSessionActiveRef.current) return;
    isMouseDownRef.current = true;
    handleMouseMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current || !userDrawCanvasRef.current) return;
    const rect = userDrawCanvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * userDrawCanvasRef.current.width;
    const py = ((e.clientY - rect.top) / rect.height) * userDrawCanvasRef.current.height;
    processDrawPoint(px, py);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    lastDrawPosRef.current = null;
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[620px]">
      
      {/* Top Bar */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/80 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
            title="العودة للاستوديو"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-serif">{drawing.title}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {drawing.mode === 'color' ? 'وضع التلوين' : 'تتبع الخط'}
              </span>
            </div>
            <p className="text-xs text-slate-400">{drawing.description}</p>
          </div>
        </div>

        {/* Live Gauges & Controls */}
        <div className="flex items-center gap-3">
          {/* Live Accuracy Meter */}
          <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-inner">
            <Activity className="w-4 h-4 text-emerald-400" />
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-semibold leading-none">نسبة الإتقان</div>
              <div className="text-sm font-bold font-mono text-emerald-400 leading-tight">
                {coverage}% <span className="text-[10px] text-slate-500">/ {drawing.targetAccuracy}%</span>
              </div>
            </div>
          </div>

          {/* Mode Switch & Gesture Selector */}
          <div className="flex items-center gap-2">
            {/* Hand Gesture Mode Selector (When in ar_hand) */}
            {inputMode === 'ar_hand' && (
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-700/80 gap-1 shadow-inner">
                <button
                  onClick={() => setGestureMode('three_finger')}
                  className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    gestureMode === 'three_finger'
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="ضم 3 أصابع (الإبهام + السبابة + الوسطى) كمسكة القلم للرسم، وافتحها لرفع القلم والتنقل بحرية"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>3 أصابع (قلم) ✍️</span>
                </button>

                <button
                  onClick={() => setGestureMode('two_finger')}
                  className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    gestureMode === 'two_finger'
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="ضم إصبعين (السبابة والإبهام) للرسم"
                >
                  <span>إصبعان 🤏</span>
                </button>

                <button
                  onClick={() => setGestureMode('index_continuous')}
                  className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    gestureMode === 'index_continuous'
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="رسم مستمر بحركة السبابة"
                >
                  <span>سبابة ☝️</span>
                </button>
              </div>
            )}

            {/* Input Device Switch: 1. Hand Tracking, 2. Mouse / Finger Touch */}
            <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-700/90 shadow-inner">
              <button
                onClick={() => setInputMode('ar_hand')}
                className={`px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5 transition-all font-bold cursor-pointer ${
                  inputMode === 'ar_hand'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="النوع الأول: تتبع حركة اليد عبر الكاميرا"
              >
                <span className="text-sm">✋</span>
                <span>تتبع اليد</span>
              </button>
              <button
                onClick={() => setInputMode('mouse_touch')}
                className={`px-3 py-1.5 text-xs rounded-xl flex items-center gap-1.5 transition-all font-bold cursor-pointer ${
                  inputMode === 'mouse_touch'
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="النوع الثاني: الرسم بالفأرة أو لمس الشاشة بالإصبع"
              >
                <span className="text-sm">🖱️</span>
                <span>فأرة / لمس</span>
              </button>
            </div>
          </div>

          {/* Hand Lab Button */}
          {inputMode === 'ar_hand' && (
            <button
              onClick={() => setIsCalibrationOpen(true)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1"
              title="مختبر فحص اليد والكاميرا"
            >
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">المعايرة</span>
            </button>
          )}

          {/* Toggle Video Feed */}
          {inputMode === 'ar_hand' && (
            <button
              onClick={() => setShowVideoFeed(!showVideoFeed)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white border border-slate-700 text-xs"
              title={showVideoFeed ? 'إخفاء معاينة الكاميرا' : 'إظهار الكاميرا'}
            >
              {showVideoFeed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Drawing Stage Area */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full bg-slate-950 flex items-center justify-center p-2 sm:p-4 overflow-hidden select-none"
        style={{ minHeight: '520px' }}
      >
        {/* Dynamic Aspect-Ratio Frame: Video & Canvases matched 1:1 for perfect skeleton alignment */}
        <div
          style={{
            aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 220px)'
          }}
          className="relative w-full max-w-[800px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center mx-auto"
        >
          {/* Layer 1: Background Video Camera */}
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={handleVideoLoadedMetadata}
            onResize={handleVideoLoadedMetadata}
            className={`absolute inset-0 w-full h-full object-contain -scale-x-100 transition-opacity duration-300 pointer-events-none ${
              inputMode === 'ar_hand' && showVideoFeed ? 'opacity-90' : 'opacity-0'
            }`}
            style={{
              filter: `brightness(${brightness}) contrast(1.15) saturate(1.15)`
            }}
          />

          {/* Layer 2: Pixel-Perfect High-Contrast Glowing Guide Line Canvas */}
          <canvas
            ref={guideCanvasRef}
            width={videoDimensions.width}
            height={videoDimensions.height}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 transition-all duration-200"
            style={{
              filter: guideColor === 'yellow'
                ? 'drop-shadow(0 0 6px rgba(250, 204, 21, 0.8)) drop-shadow(0 0 14px rgba(234, 179, 8, 0.45))'
                : guideColor === 'green'
                ? 'drop-shadow(0 0 6px rgba(74, 222, 128, 0.8)) drop-shadow(0 0 14px rgba(34, 197, 94, 0.45))'
                : guideColor === 'white'
                ? 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 12px rgba(255, 255, 255, 0.5))'
                : guideColor === 'cyan'
                ? 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.8)) drop-shadow(0 0 14px rgba(14, 165, 233, 0.45))'
                : 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.7))'
            }}
          />

          {/* Optional subtle original image backdrop when classic black is chosen */}
          {guideColor === 'black' && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none p-6"
              style={{ opacity: opacity }}
            >
              <img
                src={drawing.imageUrl}
                alt={drawing.title}
                className="max-w-[700px] max-h-[500px] w-full h-full object-contain filter drop-shadow-md select-none pointer-events-none"
              />
            </div>
          )}

          {/* Layer 3: User Real-Time Hand/Mouse Drawing Canvas */}
          <canvas
            ref={userDrawCanvasRef}
            width={videoDimensions.width}
            height={videoDimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={(e) => {
              if (!isDrawingSessionActiveRef.current) return;
              if (e.touches[0] && userDrawCanvasRef.current) {
                isMouseDownRef.current = true;
                const rect = userDrawCanvasRef.current.getBoundingClientRect();
                const touch = e.touches[0];
                const px = ((touch.clientX - rect.left) / rect.width) * userDrawCanvasRef.current.width;
                const py = ((touch.clientY - rect.top) / rect.height) * userDrawCanvasRef.current.height;
                processDrawPoint(px, py);
              }
            }}
            onTouchMove={(e) => {
              if (isMouseDownRef.current && e.touches[0] && userDrawCanvasRef.current) {
                const rect = userDrawCanvasRef.current.getBoundingClientRect();
                const touch = e.touches[0];
                const px = ((touch.clientX - rect.left) / rect.width) * userDrawCanvasRef.current.width;
                const py = ((touch.clientY - rect.top) / rect.height) * userDrawCanvasRef.current.height;
                processDrawPoint(px, py);
              }
            }}
            onTouchEnd={() => {
              isMouseDownRef.current = false;
              lastDrawPosRef.current = null;
            }}
            className="absolute inset-0 w-full h-full object-contain cursor-crosshair z-20"
          />

          {/* Layer 4: MediaPipe Hand Landmark Skeleton Canvas */}
          {inputMode === 'ar_hand' && (
            <canvas
              ref={skeletonCanvasRef}
              width={videoDimensions.width}
              height={videoDimensions.height}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none z-30"
            />
          )}

          {/* Interactive In-Canvas Hand Button (Placed INSIDE the video feed at Top-Right) */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-40 pointer-events-auto">
            <button
              ref={actionButtonRef}
              type="button"
              onClick={handleToggleButtonSession}
              className={`relative overflow-hidden px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl border-2 flex items-center gap-2.5 transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-md select-none ${
                buttonClickFeedback
                  ? 'scale-95 ring-8 ring-amber-400/80 bg-amber-400 text-slate-950'
                  : !isDrawingSessionActive
                  ? isHoveringButton
                    ? 'bg-emerald-900/95 border-emerald-400 text-emerald-100 scale-105 ring-4 ring-emerald-400/60 shadow-emerald-500/40 animate-pulse'
                    : 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200 hover:bg-emerald-900/90'
                  : isHoveringButton
                  ? 'bg-rose-900/95 border-rose-400 text-rose-100 scale-105 ring-4 ring-rose-400/60 shadow-rose-500/40 animate-pulse'
                  : 'bg-rose-950/90 border-rose-500/80 text-rose-200 hover:bg-rose-900/90'
              }`}
              title={
                !isDrawingSessionActive
                  ? 'اضغط بالماوس أو اقبض بإصبعين 🤏 لبدء جلسة الرسم'
                  : 'اضغط بالماوس أو اقبض بإصبعين 🤏 لإنهاء الرسم وحساب النتيجة'
              }
            >
              {/* Dwell Progress bar */}
              {dwellProgress > 0 && (
                <div
                  className="absolute inset-x-0 bottom-0 h-1.5 bg-amber-400 transition-all duration-75"
                  style={{ width: `${dwellProgress}%` }}
                />
              )}
              {/* Status Icon */}
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                  !isDrawingSessionActive
                    ? 'bg-emerald-500 text-slate-950 shadow-emerald-600/50'
                    : 'bg-rose-500 text-white shadow-rose-600/50'
                }`}
              >
                {!isDrawingSessionActive ? (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>

              {/* Text & Gesture Hint */}
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-extrabold text-white">
                    {!isDrawingSessionActive ? 'ابدأ الرسم' : 'إنهاء وحفظ النتيجة'}
                  </span>
                  <span
                    className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold ${
                      !isDrawingSessionActive
                        ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-400/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {!isDrawingSessionActive ? 'استعداد' : 'جارٍ الرسم ✍️'}
                  </span>
                </div>

                <div className="text-[10px] sm:text-[11px] text-slate-300 font-medium flex items-center gap-1 mt-0.5">
                  <span>انقر بإصبعين</span>
                  <span className="text-amber-400 font-bold">🤏 (سبابة + إبهام)</span>
                  {isHoveringButton && (
                    <span className="text-emerald-400 font-bold mr-1 animate-bounce">
                      ← اقبض الآن!
                    </span>
                  )}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Camera Starting Overlay */}
        {isCameraStarting && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm font-semibold text-white">جارٍ تهيئة كاميرا الرسم التفاعلي وتتبع اليد...</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute top-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 px-4 py-2 rounded-xl text-xs flex items-center gap-2 z-40">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Dynamic Pen & Gesture State Indicator */}
        <div className="absolute top-4 z-30 flex flex-col items-center gap-1.5 pointer-events-none max-w-lg px-4 text-center">
          {!isDrawingSessionActive ? (
            <div className="bg-slate-900/95 border-2 border-emerald-500/70 px-4 py-2 rounded-2xl text-xs font-bold text-white flex items-center gap-2.5 shadow-2xl backdrop-blur-md animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>
                {inputMode === 'ar_hand'
                  ? '👈 حرّك يدك إلى زر «ابدأ الرسم» بالأعلى وانقر بإصبعين 🤏 للبدء'
                  : 'اضغط على زر «ابدأ الرسم» للبدء'}
              </span>
            </div>
          ) : (
            <>
              {inputMode === 'ar_hand' ? (
                <div
                  className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all duration-200 border ${
                    isPenDown
                      ? 'bg-emerald-950/90 border-emerald-400/80 text-emerald-300 ring-4 ring-emerald-500/20 scale-105'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300'
                  }`}
                >
                  {isPenDown ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <span className="flex items-center gap-1.5">
                        ✍️ <strong className="text-white">القلم مثبّت ويرسم الآن</strong>
                        <span className="text-emerald-300/80 font-normal">
                          {gestureMode.includes('latch')
                            ? '(افرد أصابعك للتوقف ✋)'
                            : '(الأصابع مضمومة)'}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="flex items-center gap-1.5">
                        ✋ <span>القلم متوقف</span>
                        <span className="text-slate-400 font-normal">
                          {gestureMode === 'three_finger_latch'
                            ? '(ضم الـ 3 أصابع لبدء التثبيت والرسم)'
                            : gestureMode === 'two_finger_latch'
                            ? '(ضم الإصبعين للتثبيت)'
                            : gestureMode === 'three_finger'
                            ? '(ضم الـ 3 أصابع للرسم)'
                            : gestureMode === 'two_finger'
                            ? '(اقبض بالإصبعين للرسم)'
                            : '(حرّك السبابة للرسم)'}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-slate-900/90 border border-slate-700/80 px-4 py-1.5 rounded-full text-xs text-slate-300 flex items-center gap-2 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>الجلسة نشطة: اضغط واسحب بالماوس للرسم، واضغط «إنهاء» عند الاكتمال</span>
                </div>
              )}

              {coverage >= drawing.targetAccuracy && (
                <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow animate-in fade-in">
                  <span>🏆 تم تحقيق نسبة الإتقان المطلوبة ({coverage}%)! استمر بالرسم أو انقر «إنهاء الرسم» بإصبعين 🤏 لحفظ النتيجة.</span>
                </div>
              )}
            </>
          )}

          {inputMode === 'ar_hand' && isDrawingSessionActive && gestureMode === 'three_finger' && !isPenDown && (
            <div className="bg-slate-950/85 border border-slate-800 text-slate-400 px-3 py-0.5 rounded-full text-[11px] flex items-center gap-1.5 shadow">
              <span>💡 مسكة القلم: ضم (الإبهام + السبابة + الوسطى) للرسم، وافتحها للتنقل بحرية دون رسم.</span>
            </div>
          )}
        </div>

        {/* Success Modal Overlay */}
        {isFinished && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 text-center shadow-2xl space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                <Award className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-2xl font-extrabold text-white font-serif">🎉 إتقان ورسم رائع!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  تم تسجيل درجتك بنجاح في ورقة الرسم المخصصة في Google Sheets.
                </p>
              </div>

              {/* Score Badges */}
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                  <div className="text-[11px] text-slate-400 font-semibold">نسبة الثبات والتغطية</div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-400">{accuracy}%</div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                  <div className="text-[11px] text-slate-400 font-semibold">النقاط المكتسبة</div>
                  <div className="text-2xl font-extrabold font-mono text-amber-400">+{Math.round((drawing.points * accuracy) / 100)}</div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Star className="w-6 h-6 fill-current" />
                <Star className="w-6 h-6 fill-current" />
                <Star className={`w-6 h-6 ${accuracy >= 85 ? 'fill-current' : 'opacity-30'}`} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setAttempts(a => a + 1);
                    clearCanvas();
                    setIsDrawingSessionActive(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>محاولة أخرى</span>
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                >
                  العودة للرسومات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tool Bar: Palette, Guide Line Color, Thickness, Opacity, Clear, Sound */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-4">
        
        {/* Guide Color & Brush Palette */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Guide Line Color (لون خط التتبع المطلوب رسمه) */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-300 font-bold hidden sm:inline">لون خط الإرشاد:</span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {GUIDE_LINE_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setGuideColor(c.id)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                    guideColor === c.id
                      ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 border-white shadow-lg'
                      : 'opacity-70 hover:opacity-100 border-slate-700'
                  }`}
                  title={`خط إرشادي: ${c.name}`}
                />
              ))}
            </div>
          </div>

          {/* User Brush Colors */}
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">لون الفرشاة:</span>
            <div className="flex items-center gap-1.5">
              {PALETTE_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setBrushColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    brushColor === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 shadow-md' : 'opacity-80 hover:opacity-100'
                  }`}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Thickness, Opacity & Sensitivity */}
        <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
          {/* Sensitivity Selector */}
          {inputMode === 'ar_hand' && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-slate-300 font-medium hidden sm:inline">حساسية الضم:</span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                {(['easy', 'normal', 'strict'] as PinchSensitivity[]).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setSensitivity(s);
                      handTrackingService.setSensitivity(s);
                    }}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
                      sensitivity === s ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s === 'easy' ? 'سهلة' : s === 'normal' ? 'متوسطة' : 'دقيقة'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Brush Size */}
          <div className="flex items-center gap-2">
            <span>سُمك الخط:</span>
            <input
              type="range"
              min="10"
              max="45"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20 accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Outline Transparency */}
          <div className="flex items-center gap-2">
            <span>شفافية الرسمة:</span>
            <input
              type="range"
              min="0.10"
              max="0.60"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-20 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Actions: Clear, Sound, Check */}
        <div className="flex items-center gap-2">
          {drawing.arabicAudioText && (
            <button
              onClick={() => audioService.speakArabic(drawing.arabicAudioText!)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs flex items-center gap-1"
              title="نطق اسم الرسمة"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={clearCanvas}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>مسح اللوحة</span>
          </button>

          <button
            onClick={handleToggleButtonSession}
            className={`px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-lg transition-all cursor-pointer ${
              !isDrawingSessionActive
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
            }`}
          >
            {!isDrawingSessionActive ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>ابدأ الرسم</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>إنهاء وتقييم</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hand Calibration Modal */}
      <HandCalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        onSwitchToMouseMode={() => {
          setInputMode('mouse_touch');
          setIsCalibrationOpen(false);
        }}
      />
    </div>
  );
};
