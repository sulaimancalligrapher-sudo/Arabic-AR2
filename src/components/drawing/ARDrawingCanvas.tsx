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
  Play,
  Hand,
  X,
  Target,
  Compass
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
  const handleToggleButtonSessionRef = useRef<(force?: boolean) => void>(() => {});

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
  const stageFrameRef = useRef<HTMLDivElement | null>(null);

  // Mobile / Tablet detection
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(navigator.userAgent) ||
        (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024) ||
        window.innerWidth <= 840;
      setIsMobileDevice(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Performance & Throttle Refs to prevent lag on mobile and tablet
  const isHoveringButtonRef = useRef(false);
  const dwellProgressRef = useRef(0);
  const accuracyRef = useRef(0);
  const coverageRef = useRef(0);
  const lastAccuracyUpdateRef = useRef(0);
  // Arabic Letter Steps Guidance (نظام خطوات رسم الحروف وترقيمها)
  const steps = drawing.steps || [];
  const hasStepsGuide = steps.length > 0 && drawing.enableStepsGuide !== false;
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const completedStepIdsRef = useRef<Set<string>>(new Set());
  const [stepInvalidStarts, setStepInvalidStarts] = useState<number>(0);
  const [stepAlert, setStepAlert] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const stepAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isCurrentStepStartedRef = useRef(false);
  const currentStepIndexRef = useRef(0);
  currentStepIndexRef.current = currentStepIndex;
  const stepInvalidStartsRef = useRef(0);
  const lastInvalidSoundTimeRef = useRef(0);
  const [evaluationResult, setEvaluationResult] = useState<{
    isPassed: boolean;
    allStepsCompleted: boolean;
    stepsAccuracy: number;
    compositeScore: number;
    earnedScore: number;
    completedCount: number;
    totalSteps: number;
  } | null>(null);

  const showStepAlert = useCallback((message: string, type: 'error' | 'success' | 'info' = 'info') => {
    if (stepAlertTimerRef.current) {
      clearTimeout(stepAlertTimerRef.current);
    }
    setStepAlert({ message, type });
    stepAlertTimerRef.current = setTimeout(() => {
      setStepAlert(null);
    }, 2800);
  }, []);

  // Dynamic stage pixel dimensions guaranteeing zero stretching, squishing, or tablet growth loop
  const [stageDimensions, setStageDimensions] = useState<{ width: number; height: number }>({
    width: 700,
    height: 520
  });

  const updateStageDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const paddingX = isMobileDevice ? 8 : 20;
    const paddingY = isMobileDevice ? 8 : 20;

    const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Keep stage constrained so top bar and bottom toolbar are 100% visible on tablets and phones without page scroll
    const maxViewportH = Math.max(220, windowH - (isMobileDevice ? 150 : 210));
    const containerClientH = container.clientHeight > 0 ? container.clientHeight : maxViewportH;
    const availH = Math.max(160, Math.min(containerClientH - paddingY, maxViewportH));
    const availW = Math.max(160, container.clientWidth - paddingX);

    const targetAspect = (videoDimensions.width && videoDimensions.height && videoDimensions.width > 0 && videoDimensions.height > 0)
      ? videoDimensions.width / videoDimensions.height
      : (700 / 520);

    let fitW: number;
    let fitH: number;

    if (availW / availH > targetAspect) {
      fitH = availH;
      fitW = Math.round(availH * targetAspect);
    } else {
      fitW = availW;
      fitH = Math.round(availW / targetAspect);
    }

    setStageDimensions(prev => {
      if (Math.abs(prev.width - fitW) < 2 && Math.abs(prev.height - fitH) < 2) {
        return prev;
      }
      return { width: fitW, height: fitH };
    });
  }, [isMobileDevice, videoDimensions.width, videoDimensions.height]);

  useEffect(() => {
    updateStageDimensions();
    const handleResize = () => {
      updateStageDimensions();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    screen.orientation?.addEventListener?.('change', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      screen.orientation?.removeEventListener?.('change', handleResize);
    };
  }, [updateStageDimensions]);

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

  // Trigger Finish and Evaluation (تقييم صارم للخطوات ودقة المسار)
  const triggerSuccess = useCallback((finalAccuracy: number) => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    setIsFinished(true);
    isDrawingSessionActiveRef.current = false;
    setIsDrawingSessionActive(false);

    const duration = Math.max(5, Math.round((Date.now() - startTimeRef.current) / 1000));
    
    // Strict Dual Measurement: Path Coverage Accuracy + Step Sequence Adherence
    const totalStepsCount = steps.length;
    const completedCount = completedStepIdsRef.current.size;
    const allStepsCompleted = !hasStepsGuide || (totalStepsCount > 0 && completedCount === totalStepsCount);

    let stepsAccuracy = 100;
    if (hasStepsGuide && totalStepsCount > 0) {
      if (completedCount === 0) {
        stepsAccuracy = 0;
      } else {
        const rawStepScore = (completedCount / totalStepsCount) * 100;
        const penalty = Math.min(60, stepInvalidStartsRef.current * 15);
        stepsAccuracy = Math.max(0, Math.round(rawStepScore - penalty));
      }
    }

    let compositeScore: number;
    if (hasStepsGuide && totalStepsCount > 0) {
      if (!allStepsCompleted) {
        // Did not complete all steps! Strict cap to under passing threshold (max 40%)
        compositeScore = Math.min(40, Math.round(finalAccuracy * 0.3 + stepsAccuracy * 0.7));
      } else {
        compositeScore = Math.round(finalAccuracy * 0.5 + stepsAccuracy * 0.5);
      }
    } else {
      compositeScore = finalAccuracy;
    }

    const minPassAccuracy = drawing.targetAccuracy || 60;
    const isPassed = allStepsCompleted && compositeScore >= minPassAccuracy;
    const earnedScore = Math.round((drawing.points * compositeScore) / 100);

    setEvaluationResult({
      isPassed,
      allStepsCompleted,
      stepsAccuracy,
      compositeScore,
      earnedScore,
      completedCount,
      totalSteps: totalStepsCount
    });

    if (isPassed) {
      audioService.playSuccessSound();
      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch {}
    } else {
      audioService.playStepWarningSound();
    }

    const resultRecord: DrawingResult = {
      id: 'draw_' + Date.now(),
      studentId: student.id,
      studentName: student.name,
      drawingId: drawing.id,
      drawingTitle: drawing.title,
      mode: drawing.mode,
      accuracy: finalAccuracy,
      stepsAccuracy: hasStepsGuide ? stepsAccuracy : undefined,
      compositeScore: hasStepsGuide ? compositeScore : finalAccuracy,
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
  }, [attempts, drawing, hasStepsGuide, onComplete, steps, student]);

  // Unified Toggle: Start Drawing / Finish Drawing
  const handleToggleButtonSession = useCallback((force = false) => {
    const now = Date.now();
    // Cooldown of 800ms between start and finish unless forced
    if (!force && now - lastButtonTriggerRef.current < 800) {
      return;
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
      if (hasStepsGuide && steps.length > 0) {
        audioService.speakArabic(`ابدأ من النقطة الخضراء المتوهجة للخطوة الأولى`);
      } else {
        audioService.speakArabic('تم بدء جلسة الرسم! ضم الأصابع الثلاثة وابدأ التلوين');
      }
    } else {
      // 2. FINISH SESSION
      isDrawingSessionActiveRef.current = false;
      setIsDrawingSessionActive(false);
      lastDrawPosRef.current = null;
      isPenDownRef.current = false;
      setIsPenDown(false);
      setButtonClickFeedback(true);
      setTimeout(() => setButtonClickFeedback(false), 500);
      triggerSuccess(accuracyRef.current);
    }
  }, [hasStepsGuide, steps.length, triggerSuccess]);

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

    // Reset steps
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    setCompletedStepIds(new Set());
    completedStepIdsRef.current = new Set();
    isCurrentStepStartedRef.current = false;
    setStepInvalidStarts(0);
    stepInvalidStartsRef.current = 0;
    setStepAlert(null);
    setEvaluationResult(null);
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

    // Arabic Letter Steps Guidance (التحقق الصارم من البداية والنهاية والتسلسل)
    if (hasStepsGuide && steps[currentStepIndexRef.current]) {
      const activeStep = steps[currentStepIndexRef.current];
      const targetStartX = activeStep.startPoint.x * width;
      const targetStartY = activeStep.startPoint.y * height;
      const targetEndX = activeStep.endPoint.x * width;
      const targetEndY = activeStep.endPoint.y * height;

      // 1. If step is NOT started yet, user MUST hit the Green Start Dot!
      if (!isCurrentStepStartedRef.current) {
        const distStart = Math.hypot(pixelX - targetStartX, pixelY - targetStartY);
        const distEnd = Math.hypot(pixelX - targetEndX, pixelY - targetEndY);

        if (distStart <= 55) {
          // Correct start point!
          isCurrentStepStartedRef.current = true;
          audioService.playPopSound();
          showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
          lastDrawPosRef.current = { x: targetStartX, y: targetStartY }; // Snap to start point
        } else {
          // WRONG START! (e.g. started at the end point or in the middle)
          lastDrawPosRef.current = null;
          const now = Date.now();
          if (now - lastInvalidSoundTimeRef.current > 600) {
            lastInvalidSoundTimeRef.current = now;
            stepInvalidStartsRef.current++;
            setStepInvalidStarts(stepInvalidStartsRef.current);
            audioService.playStepWarningSound();
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(60); } catch {}
            }
            if (distEnd <= 70) {
              showStepAlert(`⚠️ خطأ! هذه نقطة النهاية 🔴. يجب أن تبدأ من نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber}!`, 'error');
            } else {
              showStepAlert(`⚠️ خطأ: ابدأ من نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber} أولاً!`, 'error');
            }
          }
          // CRITICAL: BLOCK DRAWING! DO NOT DRAW ANY INK OUTSIDE START POINT!
          return;
        }
      } else {
        // Step is active: check for reaching End Target
        const distEnd = Math.hypot(pixelX - targetEndX, pixelY - targetEndY);
        if (distEnd <= 48) {
          // Completed step!
          completedStepIdsRef.current.add(activeStep.id);
          setCompletedStepIds(new Set(completedStepIdsRef.current));
          audioService.playStepSuccessSound();
          try {
            confetti({
              particleCount: 25,
              spread: 45,
              origin: { x: pixelX / width, y: pixelY / height }
            });
          } catch {}

          if (currentStepIndexRef.current + 1 < steps.length) {
            const nextIdx = currentStepIndexRef.current + 1;
            currentStepIndexRef.current = nextIdx;
            setCurrentStepIndex(nextIdx);
            isCurrentStepStartedRef.current = false;
            lastDrawPosRef.current = null;
            showStepAlert(`✨ ممتاز! أكملت الخطوة ${activeStep.stepNumber}، انتقل للخطوة ${nextIdx + 1} 🟢`, 'success');
          } else {
            showStepAlert('🎉 رائع جداً ومتقن! أكملت جميع خطوات رسم الحرف بالتسلسل الصحيح!', 'success');
          }
        }
      }
    }
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

    // Check hit radius with squared distance (no Math.hypot in tight loops)
    const radius = drawingEngineService.getToleranceRadius(drawing.tolerance);
    const rSquared = radius * radius;
    let hitFound = false;

    const startX = Math.max(0, Math.floor(pixelX - radius));
    const endX = Math.min(width - 1, Math.ceil(pixelX + radius));
    const startY = Math.max(0, Math.floor(pixelY - radius));
    const endY = Math.min(height - 1, Math.ceil(pixelY + radius));

    for (let y = startY; y <= endY; y++) {
      const dy = y - pixelY;
      const dy2 = dy * dy;
      const rowOffset = y * width;
      for (let x = startX; x <= endX; x++) {
        const dx = x - pixelX;
        if (dx * dx + dy2 <= rSquared) {
          const index = rowOffset + x;
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

    const steadiness = totalSamplesRef.current > 0
      ? Math.round((onTargetSamplesRef.current / totalSamplesRef.current) * 100)
      : 100;

    // Composite accuracy score
    const currentAccuracy = Math.min(100, Math.round(covRatio * 0.7 + steadiness * 0.3));
    accuracyRef.current = currentAccuracy;
    coverageRef.current = covRatio;

    // Throttle React state update to every 250ms to eliminate UI lag while drawing
    const now = Date.now();
    if (now - lastAccuracyUpdateRef.current > 250) {
      lastAccuracyUpdateRef.current = now;
      setCoverage(covRatio);
      setAccuracy(currentAccuracy);
    }
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
      const frameEl = stageFrameRef.current || containerRef.current;
      if (frameEl) {
        const frameRect = frameEl.getBoundingClientRect();
        // Since stageFrame matches video aspect ratio 1:1, normalized coordinates map directly:
        const indexScreenX = frameRect.left + data.indexTip.x * frameRect.width;
        const indexScreenY = frameRect.top + data.indexTip.y * frameRect.height;

        const thumbScreenX = data.thumbTip ? (frameRect.left + data.thumbTip.x * frameRect.width) : indexScreenX;
        const thumbScreenY = data.thumbTip ? (frameRect.top + data.thumbTip.y * frameRect.height) : indexScreenY;

        const midScreenX = (indexScreenX + thumbScreenX) / 2;
        const midScreenY = (indexScreenY + thumbScreenY) / 2;

        const pad = 45; // Generous comfortable margin around button for natural hand movement
        const checkInside = (sx: number, sy: number) => (
          sx >= btnRect.left - pad &&
          sx <= btnRect.right + pad &&
          sy >= btnRect.top - pad &&
          sy <= btnRect.bottom + pad
        );

        isOverActionButton = checkInside(indexScreenX, indexScreenY) ||
                             checkInside(thumbScreenX, thumbScreenY) ||
                             checkInside(midScreenX, midScreenY);
      }
    }

    // Only update hover state when it changes (eliminates React re-render lag)
    if (isOverActionButton !== isHoveringButtonRef.current) {
      isHoveringButtonRef.current = isOverActionButton;
      setIsHoveringButton(isOverActionButton);
    }

    // Determine current 2-finger pinch state with scale invariance
    const directTipDist = data.thumbTip && data.indexTip
      ? Math.hypot(data.thumbTip.x - data.indexTip.x, data.thumbTip.y - data.indexTip.y)
      : 1.0;
    const isPinchingNow = data.isPinching || directTipDist < 0.11 || data.isTwoFingerOnlyPinch || (data.pinchRatio !== undefined && data.pinchRatio < 0.65);

    // Reset pinch guard as soon as fingers open
    if (!isPinchingNow) {
      pinchMustReleaseRef.current = false;
    }

    const now = Date.now();
    const canTriggerButton = (now - lastButtonTriggerRef.current > 1400) && !pinchMustReleaseRef.current;
    const isMobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1);

    // When hovering over the button, ensure pen does not draw lines across the button!
    if (isOverActionButton) {
      if (isPenDownRef.current) {
        isPenDownRef.current = false;
        setIsPenDown(false);
      }
      lastDrawPosRef.current = null;

      // On PC: immediate 2-finger pinch 🤏 over button.
      // On Mobile / Tablet: Require a deliberate hold / dwell (0.8s) so passing the hand over the front camera doesn't misfire!
      if (!isMobile && isPinchingNow && canTriggerButton) {
        pinchMustReleaseRef.current = true;
        lastButtonTriggerRef.current = now;
        dwellStartTimeRef.current = null;
        if (dwellProgressRef.current !== 0) {
          dwellProgressRef.current = 0;
          setDwellProgress(0);
        }
        setButtonClickFeedback(true);
        setTimeout(() => setButtonClickFeedback(false), 500);
        audioService.playPopSound();
        handleToggleButtonSessionRef.current(true);
      } else if (!dwellStartTimeRef.current) {
        dwellStartTimeRef.current = now;
      } else {
        // Dwell hold (0.8s hold with circular progress ring)
        const elapsed = now - dwellStartTimeRef.current;
        const progress = Math.min(100, Math.round((elapsed / 800) * 100));
        if (Math.abs(progress - dwellProgressRef.current) >= 4) {
          dwellProgressRef.current = progress;
          setDwellProgress(progress);
        }
        if (elapsed >= 800 && canTriggerButton) {
          pinchMustReleaseRef.current = true;
          lastButtonTriggerRef.current = now;
          dwellStartTimeRef.current = null;
          dwellProgressRef.current = 0;
          setDwellProgress(0);
          setButtonClickFeedback(true);
          setTimeout(() => setButtonClickFeedback(false), 500);
          audioService.playPopSound();
          handleToggleButtonSessionRef.current(true);
        }
      }
    } else {
      dwellStartTimeRef.current = null;
      if (dwellProgressRef.current !== 0) {
        dwellProgressRef.current = 0;
        setDwellProgress(0);
      }
    }

    // Interaction B: Air Pinch Gesture (Only when NOT over button and NOT in active session)
    if (!isOverActionButton) {
      if (!isDrawingSessionActiveRef.current) {
        if (isPinchingNow && canTriggerButton) {
          if (!airPinchStartTimeRef.current) {
            airPinchStartTimeRef.current = now;
          } else {
            const elapsed = now - airPinchStartTimeRef.current;
            const progress = Math.min(100, Math.round((elapsed / 1000) * 100));
            if (Math.abs(progress - dwellProgressRef.current) >= 5) {
              dwellProgressRef.current = progress;
              setDwellProgress(progress);
            }
            if (elapsed >= 1000) {
              pinchMustReleaseRef.current = true;
              airPinchStartTimeRef.current = null;
              dwellProgressRef.current = 0;
              setDwellProgress(0);
              setButtonClickFeedback(true);
              setTimeout(() => setButtonClickFeedback(false), 500);
              audioService.playPopSound();
              handleToggleButtonSessionRef.current();
            }
          }
        } else {
          airPinchStartTimeRef.current = null;
          if (dwellProgressRef.current !== 0) {
            dwellProgressRef.current = 0;
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
      if (hasStepsGuide && steps[currentStepIndexRef.current]) {
        const activeStep = steps[currentStepIndexRef.current];
        if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
          isCurrentStepStartedRef.current = false;
          showStepAlert(`⚠️ أفلِتَ القلم قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
        }
      }
      return;
    }

    // IF DRAWING: Map normalized hand position to user drawing canvas
    if (userDrawCanvasRef.current) {
      const activePoint =
        data.activeDrawPoint ||
        (gestureMode.includes('three_finger') && data.threeFingerCentroid) ||
        data.indexTip;

      if (activePoint) {
        const px = activePoint.x * userDrawCanvasRef.current.width;
        const py = activePoint.y * userDrawCanvasRef.current.height;

        // If step is not started yet, check if activePoint touches the start beacon
        if (hasStepsGuide && steps[currentStepIndexRef.current] && !isCurrentStepStartedRef.current) {
          const activeStep = steps[currentStepIndexRef.current];
          const targetStartX = activeStep.startPoint.x * userDrawCanvasRef.current.width;
          const targetStartY = activeStep.startPoint.y * userDrawCanvasRef.current.height;
          const targetEndX = activeStep.endPoint.x * userDrawCanvasRef.current.width;
          const targetEndY = activeStep.endPoint.y * userDrawCanvasRef.current.height;
          const startRadius = Math.max(35, Math.min(userDrawCanvasRef.current.width, userDrawCanvasRef.current.height) * 0.08);

          const distStart = Math.hypot(px - targetStartX, py - targetStartY);
          const distEnd = Math.hypot(px - targetEndX, py - targetEndY);

          if (distStart <= startRadius) {
            isCurrentStepStartedRef.current = true;
            audioService.playPopSound();
            showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
            lastDrawPosRef.current = { x: targetStartX, y: targetStartY };
            processDrawPoint(targetStartX, targetStartY);
          } else {
            const now = Date.now();
            if (now - lastInvalidSoundTimeRef.current > 700) {
              lastInvalidSoundTimeRef.current = now;
              stepInvalidStartsRef.current++;
              setStepInvalidStarts(stepInvalidStartsRef.current);
              audioService.playStepWarningSound();
              if (distEnd <= startRadius * 1.5) {
                showStepAlert(`⚠️ خطأ! هذه نقطة النهاية 🔴. يجب أن تبدأ من نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber}!`, 'error');
              } else {
                showStepAlert(`⚠️ خطأ: ابدأ بالضم داخل نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber}!`, 'error');
              }
            }
            return;
          }
        } else {
          processDrawPoint(px, py);
        }
      }
    }
  }, [brushColor, gestureMode, hasStepsGuide, processDrawPoint, steps]);

  handleHandUpdateRef.current = handleHandUpdate;

  // Mouse & Touch Fallback: STRICT INITIATION AT START POINT ONLY
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSessionActiveRef.current || !userDrawCanvasRef.current) return;
    const rect = userDrawCanvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * userDrawCanvasRef.current.width;
    const py = ((e.clientY - rect.top) / rect.height) * userDrawCanvasRef.current.height;

    if (hasStepsGuide && steps[currentStepIndexRef.current]) {
      const activeStep = steps[currentStepIndexRef.current];
      const targetStartX = activeStep.startPoint.x * userDrawCanvasRef.current.width;
      const targetStartY = activeStep.startPoint.y * userDrawCanvasRef.current.height;
      const targetEndX = activeStep.endPoint.x * userDrawCanvasRef.current.width;
      const targetEndY = activeStep.endPoint.y * userDrawCanvasRef.current.height;
      const startRadius = Math.max(35, Math.min(userDrawCanvasRef.current.width, userDrawCanvasRef.current.height) * 0.08);

      const distStart = Math.hypot(px - targetStartX, py - targetStartY);
      const distEnd = Math.hypot(px - targetEndX, py - targetEndY);

      if (distStart <= startRadius) {
        // Valid initiation!
        isMouseDownRef.current = true;
        isCurrentStepStartedRef.current = true;
        audioService.playPopSound();
        showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
        lastDrawPosRef.current = { x: targetStartX, y: targetStartY };
        processDrawPoint(targetStartX, targetStartY);
      } else {
        // INVALID INITIATION: Block mouse down!
        isMouseDownRef.current = false;
        isCurrentStepStartedRef.current = false;
        lastDrawPosRef.current = null;
        stepInvalidStartsRef.current++;
        setStepInvalidStarts(stepInvalidStartsRef.current);
        audioService.playStepWarningSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(60); } catch {}
        }
        if (distEnd <= startRadius * 1.5) {
          showStepAlert(`⚠️ خطأ! هذه نقطة النهاية 🔴. يجب أن تبدأ من نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber}!`, 'error');
        } else {
          showStepAlert(`⚠️ خطأ: انقر داخل نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber} أولاً!`, 'error');
        }
      }
    } else {
      isMouseDownRef.current = true;
      processDrawPoint(px, py);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current || !userDrawCanvasRef.current) return;
    if (hasStepsGuide && !isCurrentStepStartedRef.current) return; // Strict: No drawing outside valid started step!

    const rect = userDrawCanvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * userDrawCanvasRef.current.width;
    const py = ((e.clientY - rect.top) / rect.height) * userDrawCanvasRef.current.height;
    processDrawPoint(px, py);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    lastDrawPosRef.current = null;
    if (hasStepsGuide && steps[currentStepIndexRef.current]) {
      const activeStep = steps[currentStepIndexRef.current];
      if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
        isCurrentStepStartedRef.current = false;
        showStepAlert(`⚠️ رفعت الفأرة قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
      }
    }
  };

  // Native non-passive Touch Prevention to STOP whole page scrolling on Mobile & Tablet
  useEffect(() => {
    const canvas = userDrawCanvasRef.current;
    if (!canvas) return;

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (!isDrawingSessionActiveRef.current) return;
      if (e.touches[0]) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const px = ((touch.clientX - rect.left) / rect.width) * canvas.width;
        const py = ((touch.clientY - rect.top) / rect.height) * canvas.height;

        if (hasStepsGuide && steps[currentStepIndexRef.current]) {
          const activeStep = steps[currentStepIndexRef.current];
          const targetStartX = activeStep.startPoint.x * canvas.width;
          const targetStartY = activeStep.startPoint.y * canvas.height;
          const targetEndX = activeStep.endPoint.x * canvas.width;
          const targetEndY = activeStep.endPoint.y * canvas.height;
          const startRadius = Math.max(35, Math.min(canvas.width, canvas.height) * 0.08);

          const distStart = Math.hypot(px - targetStartX, py - targetStartY);
          const distEnd = Math.hypot(px - targetEndX, py - targetEndY);

          if (distStart <= startRadius) {
            isMouseDownRef.current = true;
            isCurrentStepStartedRef.current = true;
            audioService.playPopSound();
            showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
            lastDrawPosRef.current = { x: targetStartX, y: targetStartY };
            processDrawPoint(targetStartX, targetStartY);
          } else {
            isMouseDownRef.current = false;
            isCurrentStepStartedRef.current = false;
            lastDrawPosRef.current = null;
            stepInvalidStartsRef.current++;
            setStepInvalidStarts(stepInvalidStartsRef.current);
            audioService.playStepWarningSound();
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(60); } catch {}
            }
            if (distEnd <= startRadius * 1.5) {
              showStepAlert(`⚠️ خطأ! هذه نقطة النهاية 🔴. يجب أن تبدأ من نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber}!`, 'error');
            } else {
              showStepAlert(`⚠️ خطأ: المس داخل نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber} أولاً!`, 'error');
            }
          }
        } else {
          isMouseDownRef.current = true;
          processDrawPoint(px, py);
        }
      }
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (!isMouseDownRef.current || !e.touches[0]) return;
      if (hasStepsGuide && !isCurrentStepStartedRef.current) return; // Strict: No drawing outside valid started step!

      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const px = ((touch.clientX - rect.left) / rect.width) * canvas.width;
      const py = ((touch.clientY - rect.top) / rect.height) * canvas.height;
      processDrawPoint(px, py);
    };

    const onTouchEndNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      isMouseDownRef.current = false;
      lastDrawPosRef.current = null;
      if (hasStepsGuide && steps[currentStepIndexRef.current]) {
        const activeStep = steps[currentStepIndexRef.current];
        if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
          isCurrentStepStartedRef.current = false;
          showStepAlert(`⚠️ رفعت إصبعك قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
        }
      }
    };

    canvas.addEventListener('touchstart', onTouchStartNative, { passive: false });
    canvas.addEventListener('touchmove', onTouchMoveNative, { passive: false });
    canvas.addEventListener('touchend', onTouchEndNative, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEndNative, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStartNative);
      canvas.removeEventListener('touchmove', onTouchMoveNative);
      canvas.removeEventListener('touchend', onTouchEndNative);
      canvas.removeEventListener('touchcancel', onTouchEndNative);
    };
  }, [processDrawPoint]);

  // Hold timer for Action Button (to eliminate accidental taps on mobile & tablets)
  const HOLD_DURATION_MS = 800; // 0.8s hold duration
  const [touchHoldProgress, setTouchHoldProgress] = useState(0);
  const touchHoldTimerRef = useRef<number | null>(null);
  const touchHoldStartRef = useRef<number | null>(null);
  const touchHoldActiveRef = useRef<boolean>(false);
  const touchTriggeredInCurrentTouchRef = useRef<boolean>(false);

  const startTouchHold = useCallback((e?: React.SyntheticEvent) => {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const now = Date.now();
    // Guard against duplicate synthetic events, rapid re-triggers, or ongoing holds
    if (touchHoldActiveRef.current || touchTriggeredInCurrentTouchRef.current) return;
    if (now - lastButtonTriggerRef.current < 1400) return;

    touchHoldActiveRef.current = true;
    touchHoldStartRef.current = now;
    setTouchHoldProgress(0);

    if (touchHoldTimerRef.current) {
      cancelAnimationFrame(touchHoldTimerRef.current);
    }

    const tick = () => {
      if (!touchHoldStartRef.current || !touchHoldActiveRef.current) return;
      const elapsed = Date.now() - touchHoldStartRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setTouchHoldProgress(progress);

      if (progress >= 100) {
        touchHoldStartRef.current = null;
        touchHoldTimerRef.current = null;
        touchHoldActiveRef.current = false;
        touchTriggeredInCurrentTouchRef.current = true; // Lock until finger lifted!
        setTouchHoldProgress(0);
        handleToggleButtonSessionRef.current(true);
        try {
          if ('vibrate' in navigator) navigator.vibrate([40, 30, 40]);
        } catch {}
        return;
      }
      touchHoldTimerRef.current = requestAnimationFrame(tick);
    };

    touchHoldTimerRef.current = requestAnimationFrame(tick);
  }, []);

  const cancelTouchHold = useCallback((e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (touchHoldTimerRef.current) {
      cancelAnimationFrame(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }
    touchHoldStartRef.current = null;
    touchHoldActiveRef.current = false;
    touchTriggeredInCurrentTouchRef.current = false; // Reset lock when finger is physically lifted
    setTouchHoldProgress(0);
  }, []);

  const actionButtonProgress = Math.max(touchHoldProgress, dwellProgress);

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[440px] max-h-[calc(100dvh-2.5rem)]">
      
      {/* Top Bar: Separate layouts for Mobile/Tablet vs Desktop */}
      {isMobileDevice ? (
        /* Mobile & Tablet Dedicated Compact 2-Row Top Bar */
        <div className="px-3 py-2 border-b border-slate-800 bg-slate-800/90 backdrop-blur-md flex flex-col gap-2">
          {/* Row 1: Back Button + Title & Description / Mode */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                title="العودة للاستوديو"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-white font-serif truncate">{drawing.title}</h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    {drawing.mode === 'color' ? 'تلوين' : 'تتبع'}
                  </span>
                </div>
                {drawing.description && (
                  <p className="text-[11px] text-slate-400 truncate">{drawing.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Accuracy Gauge + Mode Icon Buttons (Hand ✋ & Pen 🖊️) + Video toggle (if hand mode) */}
          <div className="flex items-center justify-between gap-2 w-full pt-1.5 border-t border-slate-700/60">
            {/* Accuracy Meter */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-700">
              <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-slate-400 font-semibold">الإتقان:</span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {coverage}% <span className="text-[9px] text-slate-500">/ {drawing.targetAccuracy}%</span>
              </span>
            </div>

            {/* Mode Buttons (Icons Only: Hand for tracking, Pen for mouse/touch - No Text Labels!) */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-700">
                {/* Hand Tracking Button: Hand Icon only */}
                <button
                  type="button"
                  onClick={() => setInputMode('ar_hand')}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    inputMode === 'ar_hand'
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="تتبع حركة اليد أمام الكاميرا ✋"
                >
                  <Hand className="w-4 h-4" />
                </button>

                {/* Mouse / Touch Button: Pen Icon only */}
                <button
                  type="button"
                  onClick={() => setInputMode('mouse_touch')}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    inputMode === 'mouse_touch'
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="الرسم باللمس أو الفأرة 🖊️"
                >
                  <PenTool className="w-4 h-4" />
                </button>
              </div>

              {/* Toggle Video Feed (only in hand mode) */}
              {inputMode === 'ar_hand' && (
                <button
                  type="button"
                  onClick={() => setShowVideoFeed(!showVideoFeed)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs cursor-pointer"
                  title={showVideoFeed ? 'إخفاء معاينة الكاميرا' : 'إظهار الكاميرا'}
                >
                  {showVideoFeed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Desktop Top Bar: 100% Intact and Unchanged */
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

          {/* Live Gauges & Controls on Desktop */}
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
      )}

      {/* Main Drawing Stage Area */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 w-full bg-slate-950 flex items-center justify-center p-1 sm:p-3 overflow-hidden select-none"
      >
        {/* Dynamic Aspect-Ratio Frame: Matched 1:1 in exact pixels to prevent any stretching or squishing */}
        <div
          ref={stageFrameRef}
          style={{
            width: `${stageDimensions.width}px`,
            height: `${stageDimensions.height}px`,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center mx-auto transition-all duration-200"
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

          {/* Layer 3: User Real-Time Hand/Mouse/Touch Drawing Canvas */}
          <canvas
            ref={userDrawCanvasRef}
            width={videoDimensions.width}
            height={videoDimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="absolute inset-0 w-full h-full object-contain cursor-crosshair z-20 touch-none select-none overscroll-none drawing-canvas-surface"
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

          {/* Layer 5: Interactive Arabic Letter Steps & Calligraphy Guidance Overlay */}
          {hasStepsGuide && steps.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-35 overflow-hidden">
              {/* Note: Connecting straight line removed as Arabic calligraphy has curved paths. Only start and end beacons remain. */}

              {/* Render Completed Step Badges (Muted green checkmarks) */}
              {steps.map((st, idx) => {
                if (idx >= currentStepIndex) return null;
                return (
                  <div
                    key={'comp_' + st.id}
                    style={{
                      left: `${st.startPoint.x * 100}%`,
                      top: `${st.startPoint.y * 100}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    className="absolute flex items-center justify-center pointer-events-none"
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-500/80 border border-white text-slate-950 font-bold text-[10px] flex items-center justify-center shadow">
                      ✓
                    </div>
                  </div>
                );
              })}

              {/* Render Active Step Start Point 🟢 (Glowing Pulsing Beacon) */}
              {steps[currentStepIndex] && (
                <div
                  style={{
                    left: `${steps[currentStepIndex].startPoint.x * 100}%`,
                    top: `${steps[currentStepIndex].startPoint.y * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  className="absolute flex items-center justify-center pointer-events-none transition-all duration-300"
                >
                  <div className="relative flex items-center justify-center">
                    {/* Outer animated ripple */}
                    <span className="absolute w-12 h-12 rounded-full bg-emerald-400/50 animate-ping" />
                    <span className="absolute w-16 h-16 rounded-full bg-emerald-500/20 animate-pulse" />
                    {/* Inner core badge */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 border-2 border-white shadow-xl text-slate-950 font-black text-xs flex items-center justify-center ring-4 ring-emerald-400/40">
                      {steps[currentStepIndex].stepNumber}
                    </div>
                    {/* Floating label */}
                    <div className="absolute -bottom-6 bg-slate-950/90 text-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/40 shadow-lg whitespace-nowrap flex items-center gap-1 backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>ابدأ من هنا 🟢</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Render Active Step End Point 🎯 (Target Flag) */}
              {steps[currentStepIndex] && (
                <div
                  style={{
                    left: `${steps[currentStepIndex].endPoint.x * 100}%`,
                    top: `${steps[currentStepIndex].endPoint.y * 100}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  className="absolute flex items-center justify-center pointer-events-none transition-all duration-300"
                >
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-10 h-10 rounded-full bg-rose-500/30 animate-pulse" />
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-rose-600 to-amber-500 border-2 border-white shadow-xl text-white font-black text-[11px] flex items-center justify-center ring-2 ring-rose-400/30">
                      🎯
                    </div>
                    <div className="absolute -bottom-6 bg-slate-950/90 text-rose-300 font-bold text-[10px] px-2 py-0.5 rounded-full border border-rose-500/40 shadow-lg whitespace-nowrap backdrop-blur-sm">
                      نهاية الخطوة 🎯
                    </div>
                  </div>
                </div>
              )}

              {/* Step HUD Top Banner Inside Canvas Frame */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-md px-3.5 py-1 rounded-full border border-emerald-500/40 shadow-xl flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold text-amber-300 font-mono">
                  خطوة {steps[currentStepIndex]?.stepNumber || 1} / {steps.length}:
                </span>
                <span className="text-white text-[11px] font-semibold truncate max-w-[200px] sm:max-w-[340px]">
                  {steps[currentStepIndex]?.label || steps[currentStepIndex]?.directionDesc || 'ابدأ من النقطة الخضراء المتوهجة'}
                </span>
              </div>
            </div>
          )}

          {/* Real-Time Step Alert Toast Inside Canvas */}
          {stepAlert && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
              <div
                className={`px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold border backdrop-blur-md ${
                  stepAlert.type === 'error'
                    ? 'bg-rose-950/90 border-rose-500 text-rose-200 shadow-rose-500/25'
                    : stepAlert.type === 'success'
                    ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200 shadow-emerald-500/25'
                    : 'bg-amber-950/90 border-amber-500 text-amber-200 shadow-amber-500/25'
                }`}
              >
                {stepAlert.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : stepAlert.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>{stepAlert.message}</span>
              </div>
            </div>
          )}

          {/* Interactive In-Canvas Action Button: PC Desktop only! */}
          {!isMobileDevice && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-40 pointer-events-auto flex flex-col items-center gap-1.5">
            <button
              ref={actionButtonRef}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleToggleButtonSession(true);
              }}
              className={`relative w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-md select-none touch-none ${
                buttonClickFeedback
                  ? 'scale-90 ring-8 ring-amber-400 bg-amber-400 text-slate-950'
                  : touchHoldProgress > 0
                  ? 'scale-95 ring-4 ring-amber-400/80 shadow-amber-500/50'
                  : !isDrawingSessionActive
                  ? isHoveringButton
                    ? 'bg-emerald-600 border-2 border-emerald-300 text-slate-950 scale-105 ring-4 ring-emerald-400/60 shadow-emerald-500/60 animate-pulse'
                    : 'bg-emerald-500 hover:bg-emerald-400 border-2 border-emerald-400 text-slate-950 shadow-emerald-600/40'
                  : isHoveringButton
                  ? 'bg-rose-600 border-2 border-rose-300 text-white scale-105 ring-4 ring-rose-400/60 shadow-rose-500/60 animate-pulse'
                  : 'bg-rose-500 hover:bg-rose-400 border-2 border-rose-400 text-white shadow-rose-600/40'
              }`}
              title={
                !isDrawingSessionActive
                  ? 'المس مطولاً (0.8ث) أو اقبض بإصبعين 🤏 في الهواء لبدء الرسم'
                  : 'المس مطولاً (0.8ث) أو اقبض بإصبعين 🤏 في الهواء لإنهاء وحفظ النتيجة'
              }
            >
              {/* Circular Progress Ring (Fills smoothly during touch hold or hand pinch/dwell) */}
              <svg
                className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-0.5"
                viewBox="0 0 64 64"
              >
                {/* Background circle track */}
                <circle
                  cx="32"
                  cy="32"
                  r="27"
                  fill="none"
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth="4"
                />
                {/* Active progress track */}
                {actionButtonProgress > 0 && (
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="4.5"
                    strokeDasharray="169.6"
                    strokeDashoffset={169.6 * (1 - actionButtonProgress / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                )}
              </svg>

              {/* Clear Prominent Icon Only (Zero text inside button!) */}
              {!isDrawingSessionActive ? (
                <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5 drop-shadow-md text-slate-950 transition-transform active:scale-95" />
              ) : (
                <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-md text-white transition-transform active:scale-95" />
              )}
            </button>

            {/* Micro-hint on Hold or Hover: Shows holding feedback without bloating the button */}
            {touchHoldProgress > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/90 text-amber-300 border border-amber-500/40 shadow pointer-events-none animate-in fade-in">
                جارٍ التفعيل {Math.round(touchHoldProgress)}%
              </span>
            )}
            {inputMode === 'ar_hand' && isHoveringButton && touchHoldProgress === 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/90 text-emerald-300 border border-emerald-500/40 shadow pointer-events-none animate-bounce">
                اقبض بإصبعين 🤏 للنقر
              </span>
            )}
          </div>
          )}
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

        {/* Success / Evaluation Modal Overlay */}
        {isFinished && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 text-center shadow-2xl space-y-4">
              
              {/* Header Icon */}
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-inner ${
                evaluationResult?.isPassed
                  ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-400/40'
                  : 'bg-rose-500/20 text-rose-400 ring-2 ring-rose-400/40'
              }`}>
                {evaluationResult?.isPassed ? (
                  <Award className="w-8 h-8" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-rose-400" />
                )}
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white font-serif">
                  {evaluationResult?.isPassed
                    ? '🎉 إتقان ورسم رائع ومطابق للقواعد!'
                    : '⚠️ لم يتم اجتياز التدريب: خطأ في الخطوات'}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {evaluationResult?.isPassed
                    ? 'تم تسجيل نتيجتك بنجاح في سجل درجات الرسم.'
                    : 'يجب اتباع جميع خطوات رسم الحرف بالتسلسل والبدء دائماً من النقطة الخضراء 🟢.'}
                </p>
              </div>

              {/* Score Badges: Dual Measurement when steps exist */}
              {hasStepsGuide && steps.length > 0 ? (
                <div className="space-y-2 py-1">
                  <div className="grid grid-cols-2 gap-2 text-right">
                    <div className={`p-3 rounded-2xl border ${
                      evaluationResult?.allStepsCompleted ? 'bg-slate-800/80 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'
                    }`}>
                      <div className={`text-[10px] font-bold ${
                        evaluationResult?.allStepsCompleted ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {evaluationResult?.allStepsCompleted ? '🟢 دقة الخطوات والتسلسل' : '🔴 نقص في الخطوات'}
                      </div>
                      <div className="text-xl font-extrabold font-mono text-white mt-0.5">
                        {evaluationResult?.stepsAccuracy ?? 0}%
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        أكملت {evaluationResult?.completedCount ?? 0} من {steps.length} خطوات
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                      <div className="text-[10px] text-amber-400 font-bold">✍️ دقة مسار الخط</div>
                      <div className="text-xl font-extrabold font-mono text-white mt-0.5">{accuracy}%</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">المطلوب {drawing.targetAccuracy}%</div>
                    </div>
                  </div>

                  {/* Combined Final Score */}
                  <div className="p-2.5 rounded-2xl bg-slate-950 border border-amber-500/40 flex items-center justify-between px-4">
                    <span className="text-xs font-bold text-amber-300">التقييم المركب النهائي:</span>
                    <span className={`text-lg font-black font-mono ${
                      evaluationResult?.isPassed ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {evaluationResult?.compositeScore ?? accuracy}%
                    </span>
                  </div>

                  {/* Clear Advice / Reason */}
                  <div className={`p-2.5 rounded-xl border text-[11px] text-right leading-relaxed ${
                    evaluationResult?.isPassed
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}>
                    {evaluationResult?.isPassed ? (
                      stepInvalidStarts === 0
                        ? '✨ إتقان ممتاز! تقيدت بجميع نقاط البداية والنهاية والتسلسل الصحيح لرسم الحرف.'
                        : `💡 أحسنت، اجتزت التدريب مع ${stepInvalidStarts} محاولات تصحيح للبداية.`
                    ) : (
                      <div>
                        <strong>سبب عدم الاجتياز: </strong>
                        {!evaluationResult?.allStepsCompleted
                          ? `لم تكتمل جميع خطوات الحرف (تم إكمال ${evaluationResult?.completedCount ?? 0} من ${steps.length}). يجب البدء دائماً من النقطة الخضراء 🟢 والسحب حتى النقطة الحمراء 🎯.`
                          : `دقة مسار الخط (${accuracy}%) أقل من المطلوب (${drawing.targetAccuracy}%).`}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 py-2">
                  <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                    <div className="text-[11px] text-slate-400 font-semibold">نسبة الثبات والتغطية</div>
                    <div className="text-2xl font-extrabold font-mono text-emerald-400">{accuracy}%</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                    <div className="text-[11px] text-slate-400 font-semibold">النقاط المكتسبة</div>
                    <div className="text-2xl font-extrabold font-mono text-amber-400">+{evaluationResult?.earnedScore ?? 0}</div>
                  </div>
                </div>
              )}

              {/* Star Rating */}
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Star className={`w-6 h-6 ${evaluationResult?.isPassed ? 'fill-current' : 'opacity-20'}`} />
                <Star className={`w-6 h-6 ${evaluationResult?.isPassed && (evaluationResult?.compositeScore ?? 0) >= 75 ? 'fill-current' : 'opacity-20'}`} />
                <Star className={`w-6 h-6 ${evaluationResult?.isPassed && (evaluationResult?.compositeScore ?? 0) >= 90 ? 'fill-current' : 'opacity-20'}`} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setAttempts(a => a + 1);
                    clearCanvas();
                    setIsDrawingSessionActive(false);
                  }}
                  className={`flex-1 py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                    !evaluationResult?.isPassed
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/25 ring-2 ring-amber-400/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{evaluationResult?.isPassed ? 'تدريب مرة أخرى' : 'إعادة التدريب والبدء من جديد 🔄'}</span>
                </button>
                <button
                  onClick={onBack}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  العودة للدروس
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tool Bar: Separate layouts for Mobile/Tablet vs Desktop */}
      {isMobileDevice ? (
        /* Mobile & Tablet Dedicated Compact Single-Row Bottom Bar */
        <div className="px-3 py-2.5 border-t border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-2 z-30">
          <div className="flex items-center gap-2">
            {/* 1. Tools Button (الأدوات) -> Opens Modal */}
            <button
              type="button"
              onClick={() => setIsToolsOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              title="فتح نافذة أدوات الرسم والتلوين"
            >
              <Palette className="w-4 h-4 text-amber-400" />
              <span>الأدوات</span>
            </button>

            {/* 2. Clear Canvas Button (مسح اللوحة) */}
            <button
              type="button"
              onClick={clearCanvas}
              className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-colors cursor-pointer"
              title="مسح اللوحة"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مسح</span>
            </button>

            {/* 3. Sound Button (الصوت) */}
            {drawing.arabicAudioText && (
              <button
                type="button"
                onClick={() => audioService.speakArabic(drawing.arabicAudioText!)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs flex items-center justify-center active:scale-95 transition-colors cursor-pointer"
                title="نطق اسم الرسمة"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 4. Start / Finish & Evaluate Button (ابدأ الرسم / إنهاء وتقييم) */}
          <button
            type="button"
            onClick={() => handleToggleButtonSession(true)}
            className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer ${
              !isDrawingSessionActive
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 ring-1 ring-emerald-400/50'
                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20 ring-1 ring-rose-400/50 animate-pulse'
            }`}
          >
            {!isDrawingSessionActive ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>ابدأ الرسم</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>إنهاء وتقييم</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* Desktop Bottom Tool Bar: 100% Intact & Unchanged */
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
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
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
              onClick={() => handleToggleButtonSession(true)}
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
      )}

      {/* Mobile & Tablet Dedicated Tools Modal (Opened by clicking "الأدوات" button) */}
      {isMobileDevice && isToolsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white font-serif">أدوات الرسم والتلوين 🎨</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. Guide Line Color */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>لون خط الإرشاد (الرسمة المطلوب تتبعها):</span>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex-wrap">
                {GUIDE_LINE_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setGuideColor(c.id)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer border ${
                      guideColor === c.id
                        ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 border-white shadow-lg'
                        : 'opacity-70 hover:opacity-100 border-slate-700'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* 2. Brush Palette */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                <span>لون الفرشاة / التلوين:</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex-wrap">
                {PALETTE_COLORS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setBrushColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
                      brushColor === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 shadow-md' : 'opacity-80 hover:opacity-100'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* 3. Brush Size */}
            <div className="space-y-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span>سُمك الخط:</span>
                <span className="font-mono text-amber-400 font-bold">{brushSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="10"
                  max="45"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <div
                  className="rounded-full bg-amber-400 shrink-0"
                  style={{ width: `${Math.min(26, Math.max(10, brushSize / 1.5))}px`, height: `${Math.min(26, Math.max(10, brushSize / 1.5))}px` }}
                />
              </div>
            </div>

            {/* 4. Opacity Slider */}
            <div className="space-y-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span>شفافية الرسمة:</span>
                <span className="font-mono text-amber-400 font-bold">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.60"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* 5. Sensitivity if in Hand Tracking mode */}
            {inputMode === 'ar_hand' && (
              <div className="space-y-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>حساسية الضم:</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'normal', 'strict'] as PinchSensitivity[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSensitivity(s);
                        handTrackingService.setSensitivity(s);
                      }}
                      className={`py-1.5 text-xs rounded-xl font-bold transition-colors cursor-pointer ${
                        sensitivity === s ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {s === 'easy' ? 'سهلة' : s === 'normal' ? 'متوسطة' : 'دقيقة'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Close Button to return to drawing */}
            <button
              type="button"
              onClick={() => setIsToolsOpen(false)}
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>إغلاق وبدء الرسم ✍️</span>
            </button>
          </div>
        </div>
      )}

      {/* Hand Calibration Modal (Desktop Only) */}
      {!isMobileDevice && (
        <HandCalibrationModal
          isOpen={isCalibrationOpen}
          onClose={() => setIsCalibrationOpen(false)}
          onSwitchToMouseMode={() => {
            setInputMode('mouse_touch');
            setIsCalibrationOpen(false);
          }}
        />
      )}
    </div>
  );
};
