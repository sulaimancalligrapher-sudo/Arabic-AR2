import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { DrawingItem, DrawingResult } from '../../types';
import { drawingEngineService, GUIDE_LINE_COLORS, ImageAnalysisResult } from '../../services/drawingEngineService';
import { handTrackingService, HandData, PinchSensitivity, DrawingGestureMode } from '../../services/handTrackingService';
import { audioService } from '../../services/audioService';
import { googleSheetsService } from '../../services/googleSheetsService';
import { whiteboardSyncService, WhiteboardSyncMessage } from '../../services/whiteboardSyncService';
import confetti from 'canvas-confetti';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  Camera,
  Activity,
  CheckCircle2,
  Play,
  Eye,
  EyeOff,
  Radio,
  Wifi,
  Lock,
  Hand,
  User,
  Zap,
  Clock,
  ArrowRight,
  ShieldCheck,
  Hash,
  PenTool,
  LogOut,
  Award,
  AlertCircle
} from 'lucide-react';

interface StudentWhiteboardViewProps {
  initialDrawingId?: string | null;
  onExit?: () => void;
}

export const StudentWhiteboardView: React.FC<StudentWhiteboardViewProps> = ({
  initialDrawingId,
  onExit
}) => {
  const allDrawings = drawingEngineService.getAllDrawings();
  const defaultDrawing =
    allDrawings.find((d) => d.id === initialDrawingId) ||
    allDrawings.find((d) => d.id === whiteboardSyncService.getLatestDrawingId()) ||
    allDrawings[0];

  const [currentDrawing, setCurrentDrawing] = useState<DrawingItem>(defaultDrawing);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(true);

  // Student Identity & Flow State ('gate' -> 'waiting' -> 'drawing')
  const [roomCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('room') || localStorage.getItem('baseera_active_room') || '4821';
    }
    return '4821';
  });

  // Always show gate on initial open to allow entering name & number
  const [flowState, setFlowState] = useState<'gate' | 'waiting' | 'drawing'>('gate');

  const [studentName, setStudentName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('name') || localStorage.getItem('baseera_student_name') || '';
    }
    return '';
  });

  const [studentNumber, setStudentNumber] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('number') || localStorage.getItem('baseera_student_number') || '';
    }
    return '';
  });

  // Gate Form Inputs (pre-filled with saved or query values for convenience)
  const [inputName, setInputName] = useState(studentName);
  const [inputNumber, setInputNumber] = useState(studentNumber);
  const [gateError, setGateError] = useState<string | null>(null);

  // Natural Native Video Dimensions (Measured dynamically from camera stream)
  const [videoDims, setVideoDims] = useState<{ width: number; height: number; aspect: number }>(() => {
    if (typeof window !== 'undefined') {
      const isLandscape = window.innerWidth >= window.innerHeight;
      if (isLandscape) {
        return { width: 1280, height: 720, aspect: 1280 / 720 };
      }
      return { width: 720, height: 960, aspect: 720 / 960 };
    }
    return { width: 1280, height: 720, aspect: 16 / 9 };
  });

  // Computed Stage Pixel Dimensions (Guarantees zero stretching on PC, mobile portrait, and tablets)
  const [stageDimensions, setStageDimensions] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined') {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w >= h) {
        return { width: Math.min(w, 1280), height: Math.min(h - 80, 720) };
      }
      return { width: w, height: Math.max(320, h - 120) };
    }
    return { width: 640, height: 480 };
  });

  // Drawing & Session States
  const [isSessionActive, setIsSessionActive] = useState(false);
  const isSessionActiveRef = useRef(false);
  isSessionActiveRef.current = isSessionActive;

  const [accuracy, setAccuracy] = useState(0);
  const [coverage, setCoverage] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const isFinishedRef = useRef(false);

  // Gesture Mode (Smart Latch 3-finger default)
  const [gestureMode] = useState<DrawingGestureMode>('three_finger_latch');
  const gestureModeRef = useRef<DrawingGestureMode>('three_finger_latch');
  gestureModeRef.current = gestureMode;

  // Visual settings
  const [guideColor, setGuideColor] = useState<'yellow' | 'green' | 'white' | 'cyan' | 'black'>('yellow');
  const [brushColor] = useState('#10b981');
  const [brushSize, setBrushSize] = useState(20);
  const [sensitivity, setSensitivity] = useState<PinchSensitivity>('easy');
  const [showVideo, setShowVideo] = useState(true);
  const [isPenDown, setIsPenDown] = useState(false);
  const isPenDownRef = useRef(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Input Method: 'hand' (AI Camera tracking) vs 'touch_mouse' (Pure Whiteboard Direct Drawing)
  const [inputMethod, setInputMethod] = useState<'hand' | 'touch_mouse'>('hand');
  const inputMethodRef = useRef<'hand' | 'touch_mouse'>('hand');
  inputMethodRef.current = inputMethod;
  const [showInputMethodToggle, setShowInputMethodToggle] = useState<boolean>(false);

  // Teacher remote session gate state
  const [teacherSessionStarted, setTeacherSessionStarted] = useState(false);
  const [lessonEndedByTeacher, setLessonEndedByTeacher] = useState(false);
  const isPointerDownRef = useRef(false);

  // Arabic Letter Steps Guidance (نظام خطوات رسم الحروف وترقيمها)
  const steps = currentDrawing.steps || [];
  const hasStepsGuide = steps.length > 0 && currentDrawing.enableStepsGuide !== false;
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const currentStepIndexRef = useRef<number>(0);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const completedStepIdsRef = useRef<Set<string>>(new Set());
  const isCurrentStepStartedRef = useRef<boolean>(false);
  const [stepInvalidStarts, setStepInvalidStarts] = useState<number>(0);
  const stepInvalidStartsRef = useRef<number>(0);
  const [stepAlert, setStepAlert] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const lastInvalidSoundTimeRef = useRef<number>(0);
  const [evaluationResult, setEvaluationResult] = useState<{
    isPassed: boolean;
    allStepsCompleted: boolean;
    stepsAccuracy: number;
    compositeScore: number;
    earnedScore: number;
    completedCount: number;
    totalSteps: number;
  } | null>(null);

  const showStepAlert = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setStepAlert({ message, type });
    setTimeout(() => {
      setStepAlert((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  };

  // In-canvas button tracking
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const isHoveringButtonRef = useRef(false);
  const [dwellProgress, setDwellProgress] = useState(0);
  const dwellProgressRef = useRef(0);
  const [buttonFeedback, setButtonFeedback] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastButtonTriggerRef = useRef(0);
  const lastGesturePinchTimeRef = useRef(0);
  const dwellStartTimeRef = useRef<number | null>(null);
  const airPinchStartTimeRef = useRef<number | null>(null);
  const threeFingerJoinStartTimeRef = useRef<number | null>(null);
  const pinchMustReleaseRef = useRef<boolean>(false);
  const handleHandUpdateRef = useRef<(data: HandData) => void>(() => {});

  // Canvases and container refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userDrawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);

  const analysisRef = useRef<ImageAnalysisResult | null>(null);
  const coveredSetRef = useRef<Set<number>>(new Set());
  const onTargetSamplesRef = useRef(0);
  const totalSamplesRef = useRef(0);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  const startTimeRef = useRef(Date.now());
  const lastProgressReportRef = useRef(0);
  const lastAccuracyUpdateRef = useRef(0);
  const latestAccuracyRef = useRef(0);
  const latestCoverageRef = useRef(0);

  // Pause / Resume MediaPipe camera tracking when switching between Hand tracking and Whiteboard
  useEffect(() => {
    if (inputMethod === 'touch_mouse') {
      handTrackingService.pauseProcessing();
    } else {
      handTrackingService.resumeProcessing();
    }
  }, [inputMethod]);

  // Detect mobile / tablet
  useEffect(() => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet/i.test(navigator.userAgent) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024) ||
      window.innerWidth <= 840;

    setIsMobileDevice(isMobile);
    if (isMobile) {
      // Permanently lock input method to direct touch/stylus whiteboard on mobile & tablet
      setInputMethod('touch_mouse');
      inputMethodRef.current = 'touch_mouse';
      setShowVideo(false);
      handTrackingService.pauseProcessing();
      handTrackingService.stopTracking();
    }
  }, []);

  // Update computed stage frame dimensions:
  // - In Whiteboard Touch mode: Fills the entire mobile screen vertically & horizontally with zero black bars
  // - In Hand Tracking AR mode: Matches live camera aspect ratio 1:1 with pure mathematical box fit (no stretching)
  const updateStageDimensions = useCallback(() => {
    if (!stageContainerRef.current) return;
    const container = stageContainerRef.current;
    const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const maxViewportH = Math.max(220, windowH - (isMobileDevice ? 100 : 130));
    const availW = container.clientWidth;
    const availH = Math.min(container.clientHeight > 0 ? container.clientHeight : maxViewportH, maxViewportH);

    if (availW <= 0 || availH <= 0) return;

    // 1. PURE WHITEBOARD DIRECT TOUCH / MOUSE DRAWING MODE:
    if (inputMethodRef.current === 'touch_mouse') {
      if (isMobileDevice) {
        // On mobile and tablet: Whiteboard takes full available height and width (full-screen drawing canvas!)
        setStageDimensions(prev => {
          if (Math.abs(prev.width - availW) < 2 && Math.abs(prev.height - availH) < 2) return prev;
          return { width: availW, height: availH };
        });
      } else {
        // On desktop/PC: Fill height and maintain natural wide canvas (up to 16:9 or max available)
        const targetAspect = 16 / 9;
        const containerAspect = availW / availH;
        let fitW: number;
        let fitH: number;

        if (containerAspect > targetAspect) {
          fitH = availH;
          fitW = Math.round(availH * targetAspect);
        } else {
          fitW = availW;
          fitH = Math.round(availW / targetAspect);
        }

        setStageDimensions(prev => {
          if (Math.abs(prev.width - fitW) < 2 && Math.abs(prev.height - fitH) < 2) return prev;
          return { width: fitW, height: fitH };
        });
      }
      return;
    }

    // 2. AR CAMERA HAND TRACKING MODE:
    // Determine real aspect ratio directly from the live video element or measured stream
    const video = videoRef.current;
    let cameraAspect = videoDims.aspect;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      cameraAspect = video.videoWidth / video.videoHeight;
    }
    if (!cameraAspect || cameraAspect <= 0) {
      cameraAspect = availW >= availH ? (16 / 9) : (3 / 4);
    }

    // Perfect mathematical bounding-box fit with ZERO stretching or squishing in portrait or landscape:
    const containerAspect = availW / availH;
    let fitW: number;
    let fitH: number;

    if (containerAspect > cameraAspect) {
      // Container is wider than camera stream (e.g. tablet in landscape): fit to container height
      fitH = availH;
      fitW = Math.round(availH * cameraAspect);
    } else {
      // Container is taller than camera stream (e.g. phone in portrait): fit to container width
      fitW = availW;
      fitH = Math.round(availW / cameraAspect);
    }

    setStageDimensions(prev => {
      if (Math.abs(prev.width - fitW) < 2 && Math.abs(prev.height - fitH) < 2) return prev;
      return { width: fitW, height: fitH };
    });
  }, [isMobileDevice, videoDims.aspect]);

  // Exact rendered canvas bounding box inside stage container
  // Guarantees zero offset for step points (green/red beacons) on mobile, tablet, and PC in portrait and landscape
  const renderedCanvasBounds = useMemo(() => {
    const cWidth = videoDims.width || 700;
    const cHeight = videoDims.height || 520;
    const canvasAspect = cWidth / cHeight;

    const sWidth = stageDimensions.width || 700;
    const sHeight = stageDimensions.height || 520;
    const stageAspect = sWidth / sHeight;

    let actualW = sWidth;
    let actualH = sHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > stageAspect) {
      actualW = sWidth;
      actualH = sWidth / canvasAspect;
      offsetX = 0;
      offsetY = (sHeight - actualH) / 2;
    } else {
      actualH = sHeight;
      actualW = sHeight * canvasAspect;
      offsetX = (sWidth - actualW) / 2;
      offsetY = 0;
    }

    return { actualW, actualH, offsetX, offsetY };
  }, [videoDims.width, videoDims.height, stageDimensions.width, stageDimensions.height]);

  // Recalculate stage dimensions on resize, device orientation change, and video stream updates
  useEffect(() => {
    updateStageDimensions();

    const handleResizeOrOrientation = () => {
      if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        setVideoDims((prev) => {
          if (prev.width !== vw || prev.height !== vh) {
            return { width: vw, height: vh, aspect: vw / vh };
          }
          return prev;
        });
      }
      updateStageDimensions();
      setTimeout(updateStageDimensions, 120);
      setTimeout(updateStageDimensions, 300);
    };

    window.addEventListener('resize', handleResizeOrOrientation);
    window.addEventListener('orientationchange', handleResizeOrOrientation);
    screen.orientation?.addEventListener?.('change', handleResizeOrOrientation);

    const observer = new ResizeObserver(() => updateStageDimensions());
    if (stageContainerRef.current) {
      observer.observe(stageContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
      screen.orientation?.removeEventListener?.('change', handleResizeOrOrientation);
      observer.disconnect();
    };
  }, [updateStageDimensions]);

  // Handle Gate Form Submission
  const handleJoinClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      setGateError('يرجى كتابة اسم الطالب للانضمام للحصة');
      return;
    }
    if (!inputNumber.trim()) {
      setGateError('يرجى إدخال رقم الطالب أو رقم الجلوس');
      return;
    }

    setGateError(null);
    const cleanName = inputName.trim();
    const cleanNum = inputNumber.trim();

    setStudentName(cleanName);
    setStudentNumber(cleanNum);

    if (typeof window !== 'undefined') {
      localStorage.setItem('baseera_student_name', cleanName);
      localStorage.setItem('baseera_student_number', cleanNum);
      localStorage.setItem('baseera_student_joined', 'true');
    }

    // Connect to room via WebSockets / P2P
    whiteboardSyncService.initRole('student', roomCode, {
      id: 'std_' + cleanNum + '_' + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      number: cleanNum
    });

    audioService.playChime();
    audioService.speakArabic(`أهلاً بك يا ${cleanName}! أنت الآن في غرفة الصف وفي انتظار بدء المعلم للدرس`);
    // Transition to waiting state until teacher sends lesson
    setFlowState('waiting');
  };

  // Cloud Sync Listener: Listen for Teacher's session and drawing commands
  useEffect(() => {
    if (flowState === 'gate') return;

    const unsubscribe = whiteboardSyncService.subscribe((msg: WhiteboardSyncMessage) => {
      setIsCloudConnected(true);

      // Teacher broadcasts a new drawing lesson -> Transition immediately to drawing stage!
      if (msg.type === 'SELECT_DRAWING') {
        const payloadDrawing = msg.payload?.drawing;
        const drawingId = msg.payload?.drawingId;
        const found =
          payloadDrawing && payloadDrawing.id
            ? payloadDrawing
            : allDrawings.find((d) => d.id === drawingId);

        if (found) {
          if (found.isCustom) {
            try {
              drawingEngineService.saveCustomDrawing(found);
            } catch {
              // Ignore local storage quota limits if image is large
            }
          }
          setCurrentDrawing(found);
          clearCanvas();
          setLessonEndedByTeacher(false);
          setTeacherSessionStarted(true);
          setFlowState('drawing');
          // Wait for student or teacher to press "ابدأ" - do not start drawing immediately!
          setIsSessionActive(false);
          isSessionActiveRef.current = false;
          handTrackingService.resetLatch();
          if (found.arabicAudioText) {
            audioService.speakArabic(`المعلم حدد درس: ${found.title}. اضغط «ابدأ» للبدء ✍️`);
          }
        }
      } else if (msg.type === 'START_SESSION') {
        setTeacherSessionStarted(true);
        audioService.playChime();
        audioService.speakArabic('بدأ المعلم الجلسة! في انتظار اختيار الدرس 🚀');
      } else if (msg.type === 'FINISH_SESSION' || msg.type === 'END_LESSON_AND_EXIT') {
        setTeacherSessionStarted(false);
        setIsSessionActive(false);
        isSessionActiveRef.current = false;
        finishDrawingSession();
        if (msg.type === 'END_LESSON_AND_EXIT') {
          setLessonEndedByTeacher(true);
          audioService.speakArabic('انتهى الدرس من قِبل المعلم! تم حفظ نتيجتك ودرجاتك بنجاح');
          whiteboardSyncService.disconnectStudent();
        }
        // Exit student from active drawing canvas and show completed score card in waiting flow
        setFlowState('waiting');
      } else if (msg.type === 'CLEAR_BOARD') {
        clearCanvas();
      } else if (msg.type === 'SET_GUIDE_COLOR' && msg.payload?.color) {
        setGuideColor(msg.payload.color);
      } else if (msg.type === 'SET_BRUSH_SIZE' && msg.payload?.size) {
        setBrushSize(msg.payload.size);
      } else if (msg.type === 'SET_SENSITIVITY' && msg.payload?.sensitivity) {
        setSensitivity(msg.payload.sensitivity);
        handTrackingService.setSensitivity(msg.payload.sensitivity);
      } else if (msg.type === 'SET_INPUT_METHOD' && msg.payload?.method) {
        setInputMethod(msg.payload.method);
        if (msg.payload.method === 'touch_mouse') {
          audioService.speakArabic('السبورة البيضاء: يمكنك الآن الرسم باللمس أو بالفأرة');
        } else {
          audioService.speakArabic('وضع تتبع حركة اليد أمام الكاميرا');
        }
      } else if (msg.type === 'SET_STUDENT_INPUT_TOGGLE_VISIBLE') {
        setShowInputMethodToggle(!!msg.payload?.visible);
      }
    });

    return () => unsubscribe();
  }, [allDrawings, flowState]);

  // Load and analyze the image template matching current video dimensions
  useEffect(() => {
    if (flowState !== 'drawing') return;
    let mounted = true;

    const analyze = async () => {
      try {
        const result = await drawingEngineService.loadAndAnalyzeImage(
          currentDrawing.imageUrl,
          videoDims.width,
          videoDims.height
        );
        if (mounted) {
          analysisRef.current = result;
          clearCanvas();
          if (guideCanvasRef.current) {
            const colorOpt = GUIDE_LINE_COLORS.find((c) => c.id === guideColor) || GUIDE_LINE_COLORS[0];
            drawingEngineService.renderGuideToCanvas(
              guideCanvasRef.current,
              result.targetMask,
              result.width,
              result.height,
              colorOpt.hex,
              currentDrawing.opacity || 0.35
            );
          }
        }
      } catch (err) {
        console.warn('Whiteboard image analysis error:', err);
      }
    };

    analyze();
    return () => {
      mounted = false;
    };
  }, [currentDrawing.id, currentDrawing.imageUrl, flowState, guideColor, videoDims.width, videoDims.height]);

  // Re-render guide canvas when color, opacity, or inputMethod changes
  useEffect(() => {
    if (guideCanvasRef.current && analysisRef.current) {
      const colorOpt = GUIDE_LINE_COLORS.find((c) => c.id === guideColor) || GUIDE_LINE_COLORS[0];
      const effectiveHex = inputMethod === 'touch_mouse'
        ? (guideColor === 'white' || guideColor === 'yellow' ? '#1e293b' : colorOpt.hex)
        : colorOpt.hex;
      const effectiveOpacity = inputMethod === 'touch_mouse'
        ? 0.55
        : (currentDrawing.opacity || 0.35);

      drawingEngineService.renderGuideToCanvas(
        guideCanvasRef.current,
        analysisRef.current.targetMask,
        analysisRef.current.width,
        analysisRef.current.height,
        effectiveHex,
        effectiveOpacity
      );
    }
  }, [guideColor, currentDrawing.opacity, inputMethod]);

  // Handle dynamic video metadata to adapt to orientation changes instantly
  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    if (vw > 0 && vh > 0) {
      setVideoDims({
        width: vw,
        height: vh,
        aspect: vw / vh
      });
    }
  };

  // Setup camera & MediaPipe tracking ONCE when joining (Desktop only!)
  useEffect(() => {
    if (flowState === 'gate') return;
    if (isMobileDevice) {
      // Completely disable camera & MediaPipe hand tracking on Mobile & Tablet
      handTrackingService.stopTracking();
      return;
    }
    let mounted = true;

    const startCamera = async () => {
      if (!videoRef.current) return;
      handTrackingService.setSensitivity(sensitivity);
      handTrackingService.setDrawingGestureMode(gestureMode);

      await handTrackingService.startTracking(videoRef.current, (data: HandData) => {
        if (!mounted) return;

        // Dynamically update dimensions using functional state updater
        const dims = data.videoDimensions;
        if (dims && dims.width > 0) {
          setVideoDims((prev) => {
            if (prev.width !== dims.width || prev.height !== dims.height) {
              return dims;
            }
            return prev;
          });
        }

        handleHandUpdateRef.current(data);
      });
    };

    startCamera();
    return () => {
      mounted = false;
      handTrackingService.stopTracking();
    };
  }, [flowState, sensitivity, gestureMode, isMobileDevice]);

  const clearCanvas = () => {
    if (userDrawCanvasRef.current) {
      const ctx = userDrawCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, userDrawCanvasRef.current.width, userDrawCanvasRef.current.height);
    }
    if (skeletonCanvasRef.current) {
      const sCtx = skeletonCanvasRef.current.getContext('2d');
      sCtx?.clearRect(0, 0, skeletonCanvasRef.current.width, skeletonCanvasRef.current.height);
    }
    coveredSetRef.current.clear();
    onTargetSamplesRef.current = 0;
    totalSamplesRef.current = 0;
    lastDrawPosRef.current = null;
    latestCoverageRef.current = 0;
    latestAccuracyRef.current = 0;
    setCoverage(0);
    setAccuracy(0);
    setIsFinished(false);
    isFinishedRef.current = false;
    handTrackingService.resetLatch();

    // Reset steps state
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

  const startDrawingSession = () => {
    isFinishedRef.current = false;
    setIsFinished(false);
    setIsSessionActive(true);
    isSessionActiveRef.current = true;
    startTimeRef.current = Date.now();
    setButtonFeedback(true);
    setTimeout(() => setButtonFeedback(false), 500);
    audioService.playChime();
    if (hasStepsGuide && steps.length > 0) {
      audioService.speakArabic('ابدأ من النقطة الخضراء المتوهجة للخطوة الأولى');
    } else if (inputMethodRef.current === 'hand') {
      audioService.speakArabic('بدأت جلسة الرسم! ضم أصابعك الثلاثة وابدأ التلوين ✍️');
    } else {
      audioService.speakArabic('بدأت جلسة الرسم! ارسم بإصبعك على السبورة الآن ✍️');
    }
  };

  const finishDrawingSession = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    setIsFinished(true);
    setIsSessionActive(false);
    isSessionActiveRef.current = false;

    const duration = Math.max(5, Math.round((Date.now() - startTimeRef.current) / 1000));
    const finalAcc = latestAccuracyRef.current || accuracy;

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
        // Did not complete all steps! Strict cap to under passing threshold (max 35%)
        compositeScore = Math.min(35, Math.round(finalAcc * 0.3 + stepsAccuracy * 0.7));
      } else {
        compositeScore = Math.round(finalAcc * 0.5 + stepsAccuracy * 0.5);
      }
    } else {
      compositeScore = finalAcc;
    }

    const minPassAccuracy = currentDrawing.targetAccuracy || 60;
    const isPassed = allStepsCompleted && compositeScore >= minPassAccuracy;
    const earnedScore = Math.round((currentDrawing.points * compositeScore) / 100);

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
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      } catch {}
    } else {
      audioService.playStepWarningSound();
    }

    const resultRecord: DrawingResult = {
      id: 'board_' + Date.now(),
      studentId: 'std_' + (studentNumber || '0'),
      studentName: studentName,
      studentNumber: studentNumber,
      drawingId: currentDrawing.id,
      drawingTitle: currentDrawing.title,
      mode: currentDrawing.mode,
      accuracy: finalAcc,
      stepsAccuracy: hasStepsGuide ? stepsAccuracy : undefined,
      compositeScore: hasStepsGuide ? compositeScore : finalAcc,
      score: earnedScore,
      attempts: 1,
      timestamp: new Date().toISOString(),
      durationSeconds: duration
    };

    // Save and send to Teacher & Google Sheets
    googleSheetsService.enqueueDrawingResult(resultRecord);
    whiteboardSyncService.reportFinished({
      accuracy: compositeScore,
      score: earnedScore,
      drawingId: currentDrawing.id,
      drawingTitle: currentDrawing.title,
      durationSeconds: duration
    });
  };

  const handleToggleButton = useCallback((force = false) => {
    const now = Date.now();
    // Cooldown of 800ms between start and finish to prevent accidental rapid double-triggers (bypassed if force=true)
    if (!force && now - lastButtonTriggerRef.current < 800) {
      return;
    }
    lastButtonTriggerRef.current = now;
    dwellStartTimeRef.current = null;
    airPinchStartTimeRef.current = null;
    setDwellProgress(0);

    if (!isSessionActiveRef.current) {
      startDrawingSession();
    } else {
      finishDrawingSession();
    }
  }, [finishDrawingSession, startDrawingSession]);

  // Hold timer for Action Button (to eliminate accidental touches on mobile & tablet)
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
        handleToggleButton(true);
        try {
          if ('vibrate' in navigator) navigator.vibrate([40, 30, 40]);
        } catch {}
        return;
      }
      touchHoldTimerRef.current = requestAnimationFrame(tick);
    };

    touchHoldTimerRef.current = requestAnimationFrame(tick);
  }, [handleToggleButton]);

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

  // Flush pending throttled accuracy / score updates immediately (e.g. on stroke end or finish)
  const flushAccuracyUpdate = useCallback(() => {
    setCoverage(latestCoverageRef.current);
    setAccuracy(latestAccuracyRef.current);
  }, []);

  // Process stroke point with high-speed squared distance and row pruning
  const processDrawPoint = useCallback((pixelX: number, pixelY: number) => {
    if (!isSessionActiveRef.current || isFinishedRef.current || !analysisRef.current || !userDrawCanvasRef.current) return;

    const { width, height, targetMask, totalTargetPixels } = analysisRef.current;
    const ctx = userDrawCanvasRef.current.getContext('2d');
    if (!ctx) return;

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

    // Optimized hit test with squared radius & row pre-filtering
    const radius = drawingEngineService.getToleranceRadius(currentDrawing.tolerance);
    const radiusSq = radius * radius;
    let hitFound = false;

    const startX = Math.max(0, Math.floor(pixelX - radius));
    const endX = Math.min(width - 1, Math.ceil(pixelX + radius));
    const startY = Math.max(0, Math.floor(pixelY - radius));
    const endY = Math.min(height - 1, Math.ceil(pixelY + radius));

    for (let y = startY; y <= endY; y++) {
      const dy = y - pixelY;
      const dySq = dy * dy;
      if (dySq > radiusSq) continue;
      const yOffset = y * width;

      for (let x = startX; x <= endX; x++) {
        const dx = x - pixelX;
        if (dx * dx + dySq <= radiusSq) {
          const index = yOffset + x;
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

    const currentCovered = coveredSetRef.current.size;
    const covRatio = Math.min(100, Math.round((currentCovered / totalTargetPixels) * 100));
    latestCoverageRef.current = covRatio;

    const steadiness =
      totalSamplesRef.current > 0
        ? Math.round((onTargetSamplesRef.current / totalSamplesRef.current) * 100)
        : 100;

    const currentAccuracy = Math.min(100, Math.round(covRatio * 0.7 + steadiness * 0.3));
    latestAccuracyRef.current = currentAccuracy;

    // Check if end target reached for active step
    if (hasStepsGuide && steps[currentStepIndexRef.current] && isCurrentStepStartedRef.current) {
      const activeStep = steps[currentStepIndexRef.current];
      const targetEndX = activeStep.endPoint.x * width;
      const targetEndY = activeStep.endPoint.y * height;
      const endRadius = Math.max(35, Math.min(width, height) * 0.08);
      const distEnd = Math.hypot(pixelX - targetEndX, pixelY - targetEndY);

      if (distEnd <= endRadius) {
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

    // Throttle React state re-renders to 10 FPS to maintain 120 FPS buttery-smooth drawing on mobile/tablets
    const now = Date.now();
    if (now - lastAccuracyUpdateRef.current > 100) {
      lastAccuracyUpdateRef.current = now;
      setCoverage(covRatio);
      setAccuracy(currentAccuracy);
    }

    // Throttled progress report to teacher dashboard
    if (now - lastProgressReportRef.current > 500) {
      lastProgressReportRef.current = now;
      whiteboardSyncService.reportProgress({
        accuracy: currentAccuracy,
        coverage: covRatio,
        isDrawing: true,
        drawingId: currentDrawing.id,
        drawingTitle: currentDrawing.title
      });
    }
  }, [brushColor, brushSize, currentDrawing.id, currentDrawing.title, currentDrawing.tolerance, hasStepsGuide, steps]);

  // Exact subpixel coordinate mapping for touchscreen, stylus & mouse
  // Corrects for CSS object-contain letterboxing/pillarboxing so the pen is 100% directly beneath the finger!
  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = userDrawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    if (canvasW <= 0 || canvasH <= 0) return null;

    const canvasAspect = canvasW / canvasH;
    const rectAspect = rect.width / rect.height;

    let actualW = rect.width;
    let actualH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // Account for browser object-contain letterboxing & pillarboxing
    if (canvasAspect > rectAspect) {
      // Letterbox top and bottom
      actualW = rect.width;
      actualH = rect.width / canvasAspect;
      offsetX = 0;
      offsetY = (rect.height - actualH) / 2;
    } else {
      // Pillarbox left and right
      actualH = rect.height;
      actualW = rect.height * canvasAspect;
      offsetX = (rect.width - actualW) / 2;
      offsetY = 0;
    }

    const displayedLeft = rect.left + offsetX;
    const displayedTop = rect.top + offsetY;

    const clampedX = Math.max(displayedLeft, Math.min(displayedLeft + actualW, clientX));
    const clampedY = Math.max(displayedTop, Math.min(displayedTop + actualH, clientY));

    const px = ((clampedX - displayedLeft) / actualW) * canvasW;
    const py = ((clampedY - displayedTop) / actualH) * canvasH;

    return { px, py };
  }, []);

  // Compute exact viewport screen coordinates (pixels) from normalized camera coordinates [0, 1]
  // Accounts for CSS object-contain letterboxing/pillarboxing so air-pointing matches on-screen elements
  const getScreenCoordinatesFromNormalized = useCallback((normX: number, normY: number) => {
    const canvas = skeletonCanvasRef.current || userDrawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    if (canvasW <= 0 || canvasH <= 0) return null;

    const canvasAspect = canvasW / canvasH;
    const rectAspect = rect.width / rect.height;

    let actualW = rect.width;
    let actualH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > rectAspect) {
      actualW = rect.width;
      actualH = rect.width / canvasAspect;
      offsetX = 0;
      offsetY = (rect.height - actualH) / 2;
    } else {
      actualH = rect.height;
      actualW = rect.height * canvasAspect;
      offsetX = (rect.width - actualW) / 2;
      offsetY = 0;
    }

    const screenX = rect.left + offsetX + normX * actualW;
    const screenY = rect.top + offsetY + normY * actualH;

    return { screenX, screenY };
  }, []);

  // Pointer events for Pure Whiteboard direct drawing mode (Stylus, Touch, Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    if (inputMethodRef.current !== 'touch_mouse') return;
    if (!isSessionActiveRef.current || isFinishedRef.current || !userDrawCanvasRef.current || !analysisRef.current) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (!coords) return;

    if (hasStepsGuide && steps[currentStepIndexRef.current]) {
      const activeStep = steps[currentStepIndexRef.current];
      const { width, height } = analysisRef.current;
      const targetStartX = activeStep.startPoint.x * width;
      const targetStartY = activeStep.startPoint.y * height;
      const targetEndX = activeStep.endPoint.x * width;
      const targetEndY = activeStep.endPoint.y * height;
      const startRadius = Math.max(35, Math.min(width, height) * 0.08);

      const distStart = Math.hypot(coords.px - targetStartX, coords.py - targetStartY);
      const distEnd = Math.hypot(coords.px - targetEndX, coords.py - targetEndY);

      if (distStart <= startRadius) {
        // Valid initiation!
        isPointerDownRef.current = true;
        setIsPenDown(true);
        isCurrentStepStartedRef.current = true;
        audioService.playPopSound();
        showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
        lastDrawPosRef.current = { x: targetStartX, y: targetStartY };
        processDrawPoint(targetStartX, targetStartY);
      } else {
        // INVALID: Do not start stroke!
        isPointerDownRef.current = false;
        setIsPenDown(false);
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
          showStepAlert(`⚠️ خطأ: ابدأ بالنقر داخل نقطة البداية الخضراء 🟢 للخطوة ${activeStep.stepNumber} أولاً!`, 'error');
        }
      }
    } else {
      isPointerDownRef.current = true;
      setIsPenDown(true);
      processDrawPoint(coords.px, coords.py);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    if (inputMethodRef.current !== 'touch_mouse') return;
    if (!isPointerDownRef.current || !isSessionActiveRef.current || isFinishedRef.current || !userDrawCanvasRef.current) return;
    if (hasStepsGuide && !isCurrentStepStartedRef.current) return; // Strict: No drawing outside valid started step!

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (coords) {
      processDrawPoint(coords.px, coords.py);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();
    if (inputMethodRef.current !== 'touch_mouse') return;
    isPointerDownRef.current = false;
    setIsPenDown(false);
    lastDrawPosRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (hasStepsGuide && steps[currentStepIndexRef.current]) {
      const activeStep = steps[currentStepIndexRef.current];
      if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
        isCurrentStepStartedRef.current = false;
        showStepAlert(`⚠️ رفعت يدك قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
      }
    }
    flushAccuracyUpdate();
  };

  // Native non-passive Touch Prevention to STOP whole page scrolling on Mobile & Tablet
  useEffect(() => {
    const canvas = userDrawCanvasRef.current;
    const stage = stageFrameRef.current;
    const container = stageContainerRef.current;

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (inputMethodRef.current !== 'touch_mouse') return;
      if (!isSessionActiveRef.current || isFinishedRef.current || !canvas || !analysisRef.current) return;
      if (e.touches[0]) {
        const touch = e.touches[0];
        const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
        if (!coords) return;

        if (hasStepsGuide && steps[currentStepIndexRef.current]) {
          const activeStep = steps[currentStepIndexRef.current];
          const { width, height } = analysisRef.current;
          const targetStartX = activeStep.startPoint.x * width;
          const targetStartY = activeStep.startPoint.y * height;
          const targetEndX = activeStep.endPoint.x * width;
          const targetEndY = activeStep.endPoint.y * height;
          const startRadius = Math.max(35, Math.min(width, height) * 0.08);

          const distStart = Math.hypot(coords.px - targetStartX, coords.py - targetStartY);
          const distEnd = Math.hypot(coords.px - targetEndX, coords.py - targetEndY);

          if (distStart <= startRadius) {
            isPointerDownRef.current = true;
            setIsPenDown(true);
            isCurrentStepStartedRef.current = true;
            audioService.playPopSound();
            showStepAlert(`🟢 ممتاز! بدأت الخطوة ${activeStep.stepNumber}، تتبع مسار الحرف لنقطة النهاية 🎯`, 'info');
            lastDrawPosRef.current = { x: targetStartX, y: targetStartY };
            processDrawPoint(targetStartX, targetStartY);
          } else {
            isPointerDownRef.current = false;
            setIsPenDown(false);
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
          isPointerDownRef.current = true;
          setIsPenDown(true);
          processDrawPoint(coords.px, coords.py);
        }
      }
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (inputMethodRef.current !== 'touch_mouse') return;
      if (!isPointerDownRef.current || !isSessionActiveRef.current || isFinishedRef.current || !canvas) return;
      if (hasStepsGuide && !isCurrentStepStartedRef.current) return; // Strict: No drawing outside valid started step!

      if (e.touches[0]) {
        const touch = e.touches[0];
        const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
        if (coords) {
          processDrawPoint(coords.px, coords.py);
        }
      }
    };

    const onTouchEndNative = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (inputMethodRef.current !== 'touch_mouse') return;
      isPointerDownRef.current = false;
      setIsPenDown(false);
      lastDrawPosRef.current = null;
      if (hasStepsGuide && steps[currentStepIndexRef.current]) {
        const activeStep = steps[currentStepIndexRef.current];
        if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
          isCurrentStepStartedRef.current = false;
          showStepAlert(`⚠️ رفعت إصبعك قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
        }
      }
      flushAccuracyUpdate();
    };

    const onPreventTouchScroll = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    if (canvas) {
      canvas.addEventListener('touchstart', onTouchStartNative, { passive: false });
      canvas.addEventListener('touchmove', onTouchMoveNative, { passive: false });
      canvas.addEventListener('touchend', onTouchEndNative, { passive: false });
      canvas.addEventListener('touchcancel', onTouchEndNative, { passive: false });
    }

    if (stage) {
      stage.addEventListener('touchstart', onPreventTouchScroll, { passive: false });
      stage.addEventListener('touchmove', onPreventTouchScroll, { passive: false });
    }

    if (container) {
      container.addEventListener('touchmove', onPreventTouchScroll, { passive: false });
    }

    // Window level listener during drawing: if drawing pointer is down, stop any window scroll gesture
    const onWindowTouchMove = (e: TouchEvent) => {
      if (isPointerDownRef.current && e.cancelable) {
        e.preventDefault();
      }
    };
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false });

    return () => {
      if (canvas) {
        canvas.removeEventListener('touchstart', onTouchStartNative);
        canvas.removeEventListener('touchmove', onTouchMoveNative);
        canvas.removeEventListener('touchend', onTouchEndNative);
        canvas.removeEventListener('touchcancel', onTouchEndNative);
      }
      if (stage) {
        stage.removeEventListener('touchstart', onPreventTouchScroll);
        stage.removeEventListener('touchmove', onPreventTouchScroll);
      }
      if (container) {
        container.removeEventListener('touchmove', onPreventTouchScroll);
      }
      window.removeEventListener('touchmove', onWindowTouchMove);
    };
  }, [flowState, getCanvasCoordinates, processDrawPoint, flushAccuracyUpdate]);

  // Hand tracking update callback with Smart Latch logic
  const handleHandUpdate = useCallback((data: HandData) => {
    if (!stageFrameRef.current || !analysisRef.current) return;

    // If student is in touch_mouse Whiteboard mode, disable hand drawing
    if (inputMethodRef.current === 'touch_mouse') {
      if (skeletonCanvasRef.current) {
        const cvs = skeletonCanvasRef.current;
        const ctx = cvs.getContext('2d');
        ctx?.clearRect(0, 0, cvs.width, cvs.height);
      }
      return;
    }

    const currentMode = gestureModeRef.current;
    const hasHand = !!data.indexTip && !!data.landmarks && data.landmarks.length >= 21;

    if (!hasHand) {
      if (isPenDownRef.current && !data.isLatched) {
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

    // 1. Virtual Start / Finish Button Hit-Test & Air Gesture Trigger
    let isOverButton = false;
    if (actionButtonRef.current && data.indexTip) {
      const btn = actionButtonRef.current;
      const btnRect = btn.getBoundingClientRect();
      const indexPos = getScreenCoordinatesFromNormalized(data.indexTip.x, data.indexTip.y);
      const thumbPos = data.thumbTip ? getScreenCoordinatesFromNormalized(data.thumbTip.x, data.thumbTip.y) : indexPos;

      if (indexPos) {
        const midX = thumbPos ? (indexPos.screenX + thumbPos.screenX) / 2 : indexPos.screenX;
        const midY = thumbPos ? (indexPos.screenY + thumbPos.screenY) / 2 : indexPos.screenY;

        const pad = 45; // Generous comfortable margin around button for natural hand movement
        const checkInside = (sx: number, sy: number) => (
          sx >= btnRect.left - pad &&
          sx <= btnRect.right + pad &&
          sy >= btnRect.top - pad &&
          sy <= btnRect.bottom + pad
        );

        isOverButton = checkInside(indexPos.screenX, indexPos.screenY) ||
                       (thumbPos ? checkInside(thumbPos.screenX, thumbPos.screenY) : false) ||
                       checkInside(midX, midY);
      }
    }

    // Only update hover state when it changes (eliminates React re-render lag)
    if (isOverButton !== isHoveringButtonRef.current) {
      isHoveringButtonRef.current = isOverButton;
      setIsHoveringButton(isOverButton);
    }

    // Determine current 2-finger pinch state with scale invariance
    const directTipDist = data.thumbTip && data.indexTip
      ? Math.hypot(data.thumbTip.x - data.indexTip.x, data.thumbTip.y - data.indexTip.y)
      : 1.0;
    const isPinchingNow = data.isPinching || directTipDist < 0.15 || data.isTwoFingerOnlyPinch || (data.pinchRatio !== undefined && data.pinchRatio < 0.72);

    // Reset pinch release guard when student opens fingers
    if (!isPinchingNow) {
      pinchMustReleaseRef.current = false;
    }

    const now = Date.now();
    const canTriggerButton = (now - lastButtonTriggerRef.current > 800) && !pinchMustReleaseRef.current;

    // When hovering over the button, ensure pen does not draw lines across the button!
    if (isOverButton) {
      if (isPenDownRef.current) {
        isPenDownRef.current = false;
        setIsPenDown(false);
      }
      lastDrawPosRef.current = null;

      // On PC: immediate 2-finger pinch 🤏 over button or 0.8s dwell hover
      if (!isMobileDevice && isPinchingNow && canTriggerButton) {
        pinchMustReleaseRef.current = true;
        dwellStartTimeRef.current = null;
        if (dwellProgressRef.current !== 0) {
          dwellProgressRef.current = 0;
          setDwellProgress(0);
        }
        setButtonFeedback(true);
        setTimeout(() => setButtonFeedback(false), 500);
        audioService.playPopSound();
        try {
          if ('vibrate' in navigator) navigator.vibrate([40, 30, 40]);
        } catch {}
        handleToggleButton(true);
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
          dwellStartTimeRef.current = null;
          dwellProgressRef.current = 0;
          setDwellProgress(0);
          setButtonFeedback(true);
          setTimeout(() => setButtonFeedback(false), 500);
          audioService.playPopSound();
          try {
            if ('vibrate' in navigator) navigator.vibrate([40, 30, 40]);
          } catch {}
          handleToggleButton(true);
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
    if (!isOverButton) {
      if (!isSessionActiveRef.current) {
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
              setButtonFeedback(true);
              setTimeout(() => setButtonFeedback(false), 500);
              audioService.playPopSound();
              handleToggleButton(true);
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
    if (isSessionActiveRef.current && !isOverButton) {
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

    if (isPenDownRef.current !== isDrawing) {
      isPenDownRef.current = isDrawing;
      setIsPenDown(isDrawing);
      if (isDrawing) {
        audioService.playTickSound();
        lastDrawPosRef.current = null;
      } else {
        lastDrawPosRef.current = null;
      }
    }

    // 3. Render Skeleton & Virtual Pen
    if (skeletonCanvasRef.current) {
      const cvs = skeletonCanvasRef.current;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        if (data.landmarks && data.landmarks.length >= 21) {
          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
            [5, 9], [9, 13], [13, 17]
          ];

          // Bone lines
          ctx.lineWidth = 3;
          ctx.strokeStyle = isOverButton
            ? '#38bdf8'
            : isDrawing
            ? '#10b981'
            : 'rgba(245, 158, 11, 0.55)';

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

          // 3-Finger Pen Grip Triangle
          if (data.landmarks[4] && data.landmarks[8] && data.landmarks[12]) {
            const pThumb = data.landmarks[4];
            const pIndex = data.landmarks[8];
            const pMiddle = data.landmarks[12];

            ctx.beginPath();
            ctx.moveTo(pThumb.x * cvs.width, pThumb.y * cvs.height);
            ctx.lineTo(pIndex.x * cvs.width, pIndex.y * cvs.height);
            ctx.lineTo(pMiddle.x * cvs.width, pMiddle.y * cvs.height);
            ctx.closePath();

            if (isDrawing) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
              ctx.fill();
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#10b981';
              ctx.stroke();
            } else {
              ctx.setLineDash([5, 5]);
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // Fingertips
          if (data.thumbTip) {
            ctx.beginPath();
            ctx.arc(data.thumbTip.x * cvs.width, data.thumbTip.y * cvs.height, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
          }
          if (data.middleTip) {
            ctx.beginPath();
            ctx.arc(data.middleTip.x * cvs.width, data.middleTip.y * cvs.height, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4';
            ctx.fill();
          }
          if (data.indexTip) {
            ctx.beginPath();
            ctx.arc(data.indexTip.x * cvs.width, data.indexTip.y * cvs.height, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
          }

          // If hovering over button, show 2-finger pinch target cursor
          if (isOverButton && data.indexTip) {
            const px = data.indexTip.x * cvs.width;
            const py = data.indexTip.y * cvs.height;

            ctx.beginPath();
            ctx.arc(px, py, 24, 0, Math.PI * 2);
            ctx.strokeStyle = data.isPinching ? '#10b981' : '#38bdf8';
            ctx.lineWidth = 3.5;
            ctx.stroke();

            ctx.font = 'bold 12px Cairo, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(data.isPinching ? 'تم النقر! ✨' : 'اقبض بإصبعين 🤏 للنقر', px, py - 32);
          } else {
            // Virtual Pen Point (Centroid or index tip fallback)
            const activePoint = data.indexTip || data.activeDrawPoint || data.threeFingerCentroid;
            if (activePoint) {
              const px = activePoint.x * cvs.width;
              const py = activePoint.y * cvs.height;
              if (isDrawing) {
                ctx.beginPath();
                ctx.arc(px, py, 16, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(px, py, 8, 0, Math.PI * 2);
                ctx.fillStyle = brushColor;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.arc(px, py, 12, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          }
        }
      }
    }

    if (!isDrawing || !isSessionActiveRef.current) {
      lastDrawPosRef.current = null;
      if (hasStepsGuide && steps[currentStepIndexRef.current]) {
        const activeStep = steps[currentStepIndexRef.current];
        if (isCurrentStepStartedRef.current && !completedStepIdsRef.current.has(activeStep.id)) {
          isCurrentStepStartedRef.current = false;
          showStepAlert(`⚠️ فتحت أصابعك قبل الوصول لنقطة النهاية 🎯! أعد رسم الخطوة ${activeStep.stepNumber} من نقطة البداية 🟢`, 'info');
        }
      }
      return;
    }

    // Map point to user draw canvas
    if (userDrawCanvasRef.current) {
      const activePoint = data.activeDrawPoint || data.threeFingerCentroid || data.indexTip;
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
          // Prevent drawing repeatedly on the exact same pixel if hand hasn't moved
          if (lastDrawPosRef.current) {
            const dx = px - lastDrawPosRef.current.x;
            const dy = py - lastDrawPosRef.current.y;
            if (dx * dx + dy * dy < 4) { // Ignore micro-jitters under 2px
              return;
            }
          }

          processDrawPoint(px, py);
        }
      }
    }
  }, [brushColor, handleToggleButton, processDrawPoint, hasStepsGuide, steps]);
  handleHandUpdateRef.current = handleHandUpdate;

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // =========================================================================
  // STATE 1: STUDENT ENTRY GATE (اسم الطالب ورقمه مع زر إرسال - بدون زر خروج)
  // =========================================================================
  if (flowState === 'gate') {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto select-none font-sans">
        <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-fade-in relative text-right">
          
          {/* Top Badge */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[11px] px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>غرفة الصف: {roomCode}</span>
            </span>

            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-400" />
                <span>العودة للاستوديو</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>بث تفاعلي مباشر</span>
              </span>
            )}
          </div>

          {/* Hero Avatar / Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-3 shadow-xl shadow-amber-500/20 text-slate-950">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 animate-bounce" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-serif text-white mb-1.5">
              مرحباً بك في سبورة الأبطال 🌟
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              أدخل اسمك ورقمك للانضمام إلى حصة المعلم والبدء في الرسم بالذكاء الاصطناعي
            </p>
          </div>

          {/* Entry Form */}
          <form onSubmit={handleJoinClass} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-end gap-1.5">
                <span>اسم الطالب (الثنائي أو الثلاثي)</span>
                <User className="w-3.5 h-3.5 text-amber-400" />
              </label>
              <input
                type="text"
                required
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="مثال: أحمد محمد علي"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all placeholder:text-slate-600 text-right"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-end gap-1.5">
                <span>رقم الطالب / رقم الجلوس</span>
                <Hash className="w-3.5 h-3.5 text-amber-400" />
              </label>
              <input
                type="text"
                required
                value={inputNumber}
                onChange={(e) => setInputNumber(e.target.value)}
                placeholder="مثال: 14 أو 102"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all placeholder:text-slate-600 text-right"
              />
            </div>

            {gateError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs font-bold text-center">
                {gateError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 transition-all transform active:scale-95 cursor-pointer mt-2"
            >
              <span>تسجيل وإرسال لدخول الحصة</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
          </form>

          <p className="text-[11px] text-slate-500 text-center mt-5">
            🔒 تُسجل النتائج والدرجات باسمك ورقمك وترسل مباشرة للمعلم.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN STAGE (SHARED BY WAITING OVERLAY & ACTIVE DRAWING)
  // Camera & Canvases stay mounted continuously with zero squishing!
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden select-none font-sans">
      
      {/* Top Header: Compact, minimal margins, NO back / exit button */}
      <div className="px-3 sm:px-6 py-2 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-2 sm:gap-3 flex-wrap z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold font-serif text-sm sm:text-base border border-amber-500/30 shadow-inner">
            {flowState === 'waiting' ? '⏳' : currentDrawing.title.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black font-serif text-amber-400 leading-tight">
                {flowState === 'waiting' ? 'في انتظار اختيار الدرس' : currentDrawing.title}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 font-bold flex items-center gap-1">
                <User className="w-3 h-3 text-amber-400" />
                <span>{studentName} (#{studentNumber})</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono flex items-center gap-1 font-bold">
                <Wifi className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                <span>غرفة الصف: {roomCode}</span>
              </span>
              {isMobileDevice && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30 flex items-center gap-0.5 font-bold">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span>طبيعي {videoDims.width}x{videoDims.height}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Gauges & Stage Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Accuracy Score */}
          {flowState === 'drawing' && (
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 shadow-inner">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <div className="text-right">
                <div className="text-[9px] text-slate-400 font-semibold leading-none">نسبة الإتقان</div>
                <div className="text-xs sm:text-sm font-extrabold font-mono text-emerald-400 leading-tight">
                  {accuracy}% <span className="text-[9px] text-slate-500">/ {currentDrawing.targetAccuracy}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Mobile & Tablet Dedicated Instant Start / Finish Button */}
          {isMobileDevice && flowState === 'drawing' && (
            <button
              type="button"
              onClick={() => handleToggleButton(true)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer ${
                !isSessionActive
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 ring-2 ring-emerald-400/40'
                  : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30 ring-2 ring-rose-400/40 animate-pulse'
              }`}
            >
              {!isSessionActive ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>ابدأ الرسم</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>إنهاء وحفظ</span>
                </>
              )}
            </button>
          )}

          {/* Toggle Input Method (Hand Tracking vs Touch/Mouse): Desktop has labels, Mobile has icons only (Hand ✋ and Pen 🖊️) */}
          <div className="flex items-center bg-slate-950 p-0.5 sm:p-1 rounded-2xl border border-slate-700/80 shadow-inner">
            <button
              type="button"
              onClick={() => {
                if (inputMethod !== 'hand') {
                  setInputMethod('hand');
                  audioService.speakArabic('وضع تتبع حركة اليد أمام الكاميرا');
                }
              }}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                inputMethod === 'hand'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="تتبع حركة اليد أمام الكاميرا ✋"
            >
              <Hand className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تتبع اليد ✋</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (inputMethod !== 'touch_mouse') {
                  setInputMethod('touch_mouse');
                  audioService.speakArabic('السبورة البيضاء: يمكنك الآن الرسم باللمس أو بالفأرة');
                }
              }}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                inputMethod === 'touch_mouse'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="الرسم باللمس أو القلم 🖊️"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">فأرة / لمس 🖱️</span>
            </button>
          </div>

          {/* Desktop Only: Toggle Video Feed (only in hand mode) */}
          {!isMobileDevice && inputMethod === 'hand' && (
            <button
              onClick={() => setShowVideo(!showVideo)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs"
              title={showVideo ? 'إخفاء كاميرا الخلفية' : 'إظهار كاميرا الخلفية'}
            >
              {showVideo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}

          {/* Clear board (only when drawing) */}
          {flowState === 'drawing' && (
            <button
              onClick={clearCanvas}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors"
              title="مسح اللوحة"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مسح</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow cursor-pointer"
            title={isFullscreen ? 'تصغير الشاشة' : 'ملء الشاشة'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Back to Studio Button */}
          {onExit && (
            <button
              onClick={onExit}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
              title="العودة إلى الاستوديو الرئيسي"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">الاستوديو</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Drawing Stage Area (Dynamically fitted to camera stream with ZERO squishing on PC, Mobile, and Tablet) */}
      <div
        ref={stageContainerRef}
        className={`flex-1 w-full min-h-0 flex items-center justify-center relative overflow-hidden bg-slate-950 ${
          isMobileDevice ? 'p-0 sm:p-1' : 'p-0'
        }`}
      >
        {/* Dynamic Aspect-Ratio Frame: Pure Whiteboard or Dark AR Camera */}
        <div
          ref={stageFrameRef}
          style={{
            width: `${stageDimensions.width}px`,
            height: `${stageDimensions.height}px`,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          className={`relative overflow-hidden transition-all duration-300 flex items-center justify-center ${
            inputMethod === 'touch_mouse'
              ? 'bg-white border-4 border-slate-300 shadow-2xl'
              : 'bg-slate-950 border border-slate-800 shadow-2xl'
          } ${
            isMobileDevice ? 'rounded-xl sm:rounded-2xl' : 'rounded-none sm:rounded-xl'
          }`}
        >
          {/* Layer 1: Mirror Video Camera Feed (Visible only in Hand Tracking mode) */}
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={handleVideoLoadedMetadata}
            onResize={handleVideoLoadedMetadata}
            className={`absolute inset-0 w-full h-full object-contain -scale-x-100 transition-opacity duration-300 pointer-events-none ${
              showVideo && inputMethod === 'hand' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              filter: 'brightness(1.05) contrast(1.1) saturate(1.2)',
              imageRendering: '-webkit-optimize-contrast' as any
            }}
          />

          {/* Layer 2: Glowing Guide Canvas (Scaled exactly to native video dimensions) */}
          {flowState === 'drawing' && (
            <canvas
              ref={guideCanvasRef}
              width={videoDims.width}
              height={videoDims.height}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 transition-all duration-200"
              style={{
                filter:
                  inputMethod === 'touch_mouse'
                    ? 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))'
                    : guideColor === 'yellow'
                    ? 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.9)) drop-shadow(0 0 16px rgba(234, 179, 8, 0.5))'
                    : guideColor === 'green'
                    ? 'drop-shadow(0 0 8px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 16px rgba(34, 197, 94, 0.5))'
                    : guideColor === 'white'
                    ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.95))'
                    : guideColor === 'cyan'
                    ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.9)) drop-shadow(0 0 16px rgba(14, 165, 233, 0.5))'
                    : 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.7))'
              }}
            />
          )}

          {/* Layer 3: Student Live Drawing Canvas (Universal Touch, Stylus, Pointer & Mouse Drag) */}
          {flowState === 'drawing' && (
            <canvas
              ref={userDrawCanvasRef}
              width={videoDims.width}
              height={videoDims.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`absolute inset-0 w-full h-full object-contain cursor-crosshair z-20 touch-none ${
                inputMethod === 'touch_mouse' ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            />
          )}

          {/* Layer 4: Aligned Hand Skeleton Canvas (Only active in Hand tracking mode) */}
          <canvas
            ref={skeletonCanvasRef}
            width={videoDims.width}
            height={videoDims.height}
            className={`absolute inset-0 w-full h-full object-contain pointer-events-none z-30 ${
              inputMethod === 'touch_mouse' ? 'hidden' : 'block'
            }`}
          />

          {/* Layer 5: Interactive Arabic Letter Steps & Calligraphy Guidance Overlay */}
          {hasStepsGuide && steps.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${renderedCanvasBounds.offsetX}px`,
                top: `${renderedCanvasBounds.offsetY}px`,
                width: `${renderedCanvasBounds.actualW}px`,
                height: `${renderedCanvasBounds.actualH}px`,
                pointerEvents: 'none',
                overflow: 'hidden'
              }}
              className="z-35"
            >
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
                    <div className="w-5 h-5 rounded-full bg-emerald-500/80 border border-white text-slate-950 font-bold text-[9px] flex items-center justify-center shadow">
                      ✓
                    </div>
                  </div>
                );
              })}

              {/* Render Active Step Start Point 🟢 (Compact Glowing Beacon) */}
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
                    {/* Subtle outer ripple */}
                    <span className="absolute w-8 h-8 rounded-full bg-emerald-400/35 animate-ping" />
                    {/* Compact core badge */}
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 border border-white shadow-lg text-slate-950 font-black text-[10px] flex items-center justify-center ring-2 ring-emerald-400/40">
                      {steps[currentStepIndex].stepNumber}
                    </div>
                    <span className="absolute -bottom-5 bg-slate-950/90 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-500/40 whitespace-nowrap shadow-md font-bold">
                      ابدأ 🟢
                    </span>
                  </div>
                </div>
              )}

              {/* Render Active Step End Point 🎯 (Compact Target Flag) */}
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
                    <span className="absolute w-7 h-7 rounded-full bg-rose-500/25 animate-pulse" />
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-tr from-rose-600 to-rose-400 border border-white shadow-lg text-white font-black text-[9px] flex items-center justify-center ring-2 ring-rose-400/30">
                      🎯
                    </div>
                    <span className="absolute -bottom-5 bg-slate-950/90 text-rose-300 text-[9px] px-1.5 py-0.5 rounded-full border border-rose-500/40 whitespace-nowrap shadow-md font-bold">
                      النهاية 🔴
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* UNIFIED HUD GUIDANCE BOX: Single Dynamic Adaptive Container   */}
          {/* All alerts, step guidelines, and drawing states unified in ONE box */}
          {/* ============================================================== */}
          <div className="absolute top-2.5 sm:top-3.5 left-1/2 -translate-x-1/2 z-45 max-w-[94%] sm:max-w-xl w-max pointer-events-none transition-all duration-300">
            {stepAlert ? (
              /* PRIORITY 1: High-Priority Live Step Alert Toast */
              <div
                className={`px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs sm:text-sm font-bold border backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 ${
                  stepAlert.type === 'error'
                    ? 'bg-rose-950/95 border-rose-500 text-rose-200 shadow-rose-500/30 ring-2 ring-rose-500/40'
                    : stepAlert.type === 'success'
                    ? 'bg-emerald-950/95 border-emerald-500 text-emerald-200 shadow-emerald-500/30 ring-2 ring-emerald-500/40'
                    : 'bg-amber-950/95 border-amber-500 text-amber-200 shadow-amber-500/30 ring-2 ring-amber-500/40'
                }`}
              >
                {stepAlert.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0 animate-bounce" />
                ) : stepAlert.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                )}
                <span className="font-sans font-bold leading-tight">{stepAlert.message}</span>
              </div>
            ) : hasStepsGuide && steps.length > 0 ? (
              /* PRIORITY 2: Step-by-Step Arabic Calligraphy Guidance */
              <div className="bg-slate-950/90 border border-emerald-500/50 shadow-2xl backdrop-blur-md px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl flex items-center gap-2 sm:gap-2.5 text-xs sm:text-sm animate-in fade-in duration-200">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span className="font-black text-amber-300 font-mono text-xs sm:text-sm px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20 shrink-0">
                  خطوة {steps[currentStepIndex]?.stepNumber || (currentStepIndex + 1)} / {steps.length}
                </span>
                <span className="text-white font-bold truncate max-w-[200px] sm:max-w-xs">
                  {isPenDown
                    ? '🖌️ اسحب القلم باتجاه الهدف الأحمر 🎯'
                    : steps[currentStepIndex]?.label ||
                      steps[currentStepIndex]?.directionDesc ||
                      'ابدأ من النقطة الخضراء المتوهجة 🟢'}
                </span>
                {!isSessionActive && (
                  <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline">
                    (اضغط «ابدأ الرسم» للبدء)
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* Interactive In-Canvas Button (Start / Finish Session) - PC & Desktop Only */}
          {!isMobileDevice && flowState === 'drawing' && (
            <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-50 flex flex-col items-end gap-1.5 pointer-events-auto">
              <button
                ref={actionButtonRef}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleButton(true);
                }}
                className={`relative overflow-hidden w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-md select-none p-0 border-2 ${
                  buttonFeedback
                    ? 'scale-95 ring-8 ring-amber-400 bg-amber-400 text-slate-950'
                    : !isSessionActive
                    ? isHoveringButton
                      ? 'bg-emerald-600 border-2 border-emerald-300 text-white scale-105 ring-4 ring-emerald-400/60 shadow-emerald-500/60 animate-pulse'
                      : 'bg-emerald-500 hover:bg-emerald-400 border-2 border-emerald-400 text-slate-950 shadow-emerald-600/40'
                    : isHoveringButton
                    ? 'bg-rose-600 border-2 border-rose-300 text-white scale-105 ring-4 ring-rose-400/60 shadow-rose-500/60 animate-pulse'
                    : 'bg-rose-500 hover:bg-rose-400 border-2 border-rose-400 text-white shadow-rose-600/40'
                }`}
                title={
                  !isSessionActive
                    ? 'انقر بالفأرة أو اقبض بإصبعين 🤏 في الهواء لبدء الرسم'
                    : 'انقر بالفأرة أو اقبض بإصبعين 🤏 في الهواء لإنهاء وحفظ النتيجة'
                }
              >
                {/* Circular Progress Ring */}
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-0.5"
                  viewBox="0 0 64 64"
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth="4"
                  />
                  {dwellProgress > 0 && (
                    <circle
                      cx="32"
                      cy="32"
                      r="27"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="4.5"
                      strokeDasharray="169.6"
                      strokeDashoffset={169.6 * (1 - dwellProgress / 100)}
                      strokeLinecap="round"
                      className="transition-all duration-75"
                    />
                  )}
                </svg>

                {/* Clear Prominent Icon Only */}
                {!isSessionActive ? (
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5 drop-shadow-md text-slate-950 transition-transform active:scale-95" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-md text-white transition-transform active:scale-95" />
                )}
              </button>

              {/* Tooltip hint on Desktop */}
              <div className="bg-slate-900/90 border border-slate-700/80 px-2.5 py-0.5 rounded-lg text-[10px] font-bold text-slate-200 shadow-md pointer-events-none">
                {!isSessionActive ? 'ابدأ الرسم ◀️' : 'إنهاء وحفظ ✔️'}
              </div>
            </div>
          )}

          {/* Smart Latch Drawing Status Badge */}
          {flowState === 'drawing' && isSessionActive && (
            <div className="absolute top-3 sm:top-4 left-3 sm:left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-bold transition-all shadow-xl select-none bg-slate-900/90 border-slate-700">
              {inputMethod === 'touch_mouse' ? (
                isPenDown ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <PenTool className="w-3.5 h-3.5" />
                    <span className="text-[11px] sm:text-xs">جاري الرسم باللمس / الفأرة 🖌️</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sky-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <PenTool className="w-3.5 h-3.5" />
                    <span className="text-[11px] sm:text-xs">المس الشاشة أو اسحب بالفأرة للرسم 🖌️</span>
                  </span>
                )
              ) : isPenDown ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <Lock className="w-3.5 h-3.5" />
                  <span className="text-[11px] sm:text-xs">القلم مثبّت ويرسم ✍️ (افرد أصابعك للتوقف ✋)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <Hand className="w-3.5 h-3.5" />
                  <span className="text-[11px] sm:text-xs">ضم أصابعك الـ 3 لبدء التثبيت ✍️</span>
                </span>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* WAITING OVERLAY: Shown after registration until Teacher starts */}
          {/* ============================================================== */}
          {flowState === 'waiting' && (
            <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center animate-fade-in">
              <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                
                {/* Live Room Badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>متصل بنجاح بغرفة الصف: {roomCode}</span>
                </div>

                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-sky-500/10 border-2 border-sky-400/30 flex items-center justify-center mx-auto text-sky-400 shadow-xl shadow-sky-500/10">
                  <Clock className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" style={{ animationDuration: '6s' }} />
                </div>

                <div>
                  <h2 className="text-lg sm:text-2xl font-black text-white font-serif mb-1">
                    أهلاً بك يا بطل: <span className="text-amber-400">{studentName}</span>
                  </h2>
                  <div className="text-xs text-slate-400 font-mono font-bold">
                    رقم الطالب: #{studentNumber}
                  </div>
                </div>

                {lessonEndedByTeacher ? (
                  <div className="p-5 rounded-2xl bg-rose-950/80 border-2 border-rose-500/60 space-y-3 text-center animate-fade-in shadow-2xl">
                    <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-rose-900/90 text-rose-200 font-extrabold text-xs">
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>تم إنهاء الدرس وإخراجك من قِبل المعلم (إخراج إجباري) 🛑</span>
                    </div>
                    <div className="text-xs text-slate-200">
                      تم حفظ نتيجتك ودرجتك في النظام: <strong className="text-amber-400 font-mono text-sm">{latestAccuracyRef.current || accuracy || 80}% إتقان</strong> ({Math.round((currentDrawing.points * (latestAccuracyRef.current || accuracy || 80)) / 100)} نقطة).
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      قام المعلم بإنهاء الجلسة وإخراج الطلاب بالكامل لحفظ السجلات في Google Sheets. تم حذفك من قائمة الحضور النشطة.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setLessonEndedByTeacher(false);
                          setStudentName('');
                          setStudentNumber('');
                          setFlowState('gate');
                        }}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>الانضمام كطالب جديد / جلسة جديدة</span>
                      </button>
                      <button
                        onClick={() => {
                          window.location.href = '/';
                        }}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs inline-flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                      >
                        <span>العودة للرئيسية</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <p className="text-sm font-bold text-sky-300 flex items-center justify-center gap-2">
                      <Radio className="w-4 h-4 animate-pulse text-sky-400" />
                      <span>
                        {teacherSessionStarted
                          ? '🟢 بدأ المعلم الجلسة بنجاح! في انتظار تحديد الدرس...'
                          : 'في انتظار المعلم لبدء الجلسة... ⏳'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {teacherSessionStarted
                        ? 'الجلسة نشطة الآن! ثوانٍ معدودة وسيحدد المعلم الدرس لتظهر أمامك اللوحة فوراً وتبدأ بالرسم 🎨'
                        : 'بمجرد أن يبدأ المعلم الجلسة ويحدد الرسمة من لوحة التحكم، ستظهر أمامك على الفور وتبدأ في الرسم والتلوين 🎨'}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-400 font-bold bg-slate-950/60 py-2.5 rounded-xl border border-slate-800/80">
                  {teacherSessionStarted ? (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                      <span className="text-amber-300">الجلسة بدأت! المعلم يختار الدرس الآن 🚀</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>الغرفة متصلة وجاهزة، في انتظار إشارة المعلم 🟢</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Evaluation Modal Overlay (Strict Pass / Fail + Dual Measurement) */}
          {isFinished && (
            <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
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
                      ? `🎉 إتقان ورسم رائع يا ${studentName}!`
                      : '⚠️ لم يتم اجتياز التدريب: خطأ في الخطوات'}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    {evaluationResult?.isPassed
                      ? `تم إكمال رسمة «${currentDrawing.title}» بنجاح وتسجيل درجتك باسمك (${studentName}) للمعلم!`
                      : 'يجب اتباع جميع خطوات رسم الحرف بالتسلسل والبدء دائماً من النقطة الخضراء 🟢 والانتهاء عند النقطة الحمراء 🎯.'}
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
                        <div className="text-[9px] text-slate-400 mt-0.5">المطلوب {currentDrawing.targetAccuracy}%</div>
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
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-6 mb-2">
                    <div>
                      <div className="text-xs text-slate-400">نسبة الإتقان</div>
                      <div className="text-2xl font-black font-mono text-emerald-400">{accuracy}%</div>
                    </div>
                    <div className="w-px h-10 bg-slate-800" />
                    <div>
                      <div className="text-xs text-slate-400">النقاط المكتسبة</div>
                      <div className="text-2xl font-black font-mono text-amber-400">
                        +{Math.round((currentDrawing.points * accuracy) / 100)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={clearCanvas}
                    className={`w-full py-3 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer ${
                      evaluationResult?.isPassed
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                    }`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{evaluationResult?.isPassed ? 'التدرب مرة أخرى 🎨' : 'إعادة المحاولة من البداية 🔄'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
