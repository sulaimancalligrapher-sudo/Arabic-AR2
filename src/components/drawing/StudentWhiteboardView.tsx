import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  LogOut
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
    if (typeof window !== 'undefined' && window.innerWidth > 840) {
      return { width: 1280, height: 720, aspect: 1280 / 720 };
    }
    return { width: 640, height: 480, aspect: 640 / 480 };
  });

  // Computed Stage Pixel Dimensions (Guarantees zero stretching on PC, mobile portrait, and tablets)
  const [stageDimensions, setStageDimensions] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 840) {
      return { width: 1280, height: 720 };
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

  // In-canvas button tracking
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [buttonFeedback, setButtonFeedback] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastButtonTriggerRef = useRef(0);
  const lastGesturePinchTimeRef = useRef(0);
  const dwellStartTimeRef = useRef<number | null>(null);
  const airPinchStartTimeRef = useRef<number | null>(null);
  const threeFingerJoinStartTimeRef = useRef<number | null>(null);
  const pinchMustReleaseRef = useRef<boolean>(false);

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
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) ||
      window.innerWidth <= 840;
    setIsMobileDevice(isMobile);
  }, []);

  // Update computed stage frame dimensions:
  // - On PC: Maximize camera size to fill the browser window with minimal margins
  // - On Mobile/Tablet: Keep natural suitable fit
  const updateStageDimensions = useCallback(() => {
    if (!stageContainerRef.current) return;
    const container = stageContainerRef.current;
    const availW = container.clientWidth;
    const availH = container.clientHeight;

    if (availW <= 0 || availH <= 0) return;

    if (!isMobileDevice) {
      // ON COMPUTER / LARGE SCREENS: Fill available height and maximize width with minimal side margins
      const targetAspect = videoDims.aspect || (16 / 9);
      let renderW = availW;
      let renderH = availW / targetAspect;

      if (renderH > availH) {
        renderH = availH;
        renderW = Math.round(availH * targetAspect);
      }

      setStageDimensions({
        width: Math.min(availW, Math.floor(renderW)),
        height: Math.min(availH, Math.floor(renderH))
      });
    } else {
      // ON MOBILE / TABLET: Keep the current suitable natural fit
      const targetAspect = videoDims.aspect || 640 / 480;

      let renderW = availW;
      let renderH = availW / targetAspect;

      if (renderH > availH) {
        renderH = availH;
        renderW = availH * targetAspect;
      }

      setStageDimensions({
        width: Math.max(280, Math.floor(renderW)),
        height: Math.max(210, Math.floor(renderH))
      });
    }
  }, [isMobileDevice, videoDims.aspect]);

  // Recalculate stage dimensions on resize or when video aspect changes
  useEffect(() => {
    updateStageDimensions();
    const handleResize = () => updateStageDimensions();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => updateStageDimensions());
    if (stageContainerRef.current) {
      observer.observe(stageContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
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

  // Setup camera & MediaPipe tracking ONCE when joining (persists across waiting and drawing)
  useEffect(() => {
    if (flowState === 'gate') return;
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

        handleHandUpdate(data);
      });
    };

    startCamera();
    return () => {
      mounted = false;
      handTrackingService.stopTracking();
    };
  }, [flowState, sensitivity, gestureMode]);

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
  };

  const startDrawingSession = () => {
    setIsSessionActive(true);
    isSessionActiveRef.current = true;
    startTimeRef.current = Date.now();
    setButtonFeedback(true);
    setTimeout(() => setButtonFeedback(false), 500);
    audioService.playChime();
    audioService.speakArabic('بدأت جلسة الرسم! ضم أصابعك الثلاثة وابدأ التلوين ✍️');
  };

  const finishDrawingSession = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    setIsFinished(true);
    setIsSessionActive(false);
    isSessionActiveRef.current = false;
    audioService.playSuccessSound();

    try {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } catch {
      // Ignore
    }

    const duration = Math.max(5, Math.round((Date.now() - startTimeRef.current) / 1000));
    const finalAcc = latestAccuracyRef.current || accuracy || 80;
    const earnedScore = Math.round((currentDrawing.points * finalAcc) / 100);

    const resultRecord: DrawingResult = {
      id: 'board_' + Date.now(),
      studentId: 'std_' + (studentNumber || '0'),
      studentName: studentName,
      studentNumber: studentNumber,
      drawingId: currentDrawing.id,
      drawingTitle: currentDrawing.title,
      mode: currentDrawing.mode,
      accuracy: finalAcc,
      score: earnedScore,
      attempts: 1,
      timestamp: new Date().toISOString(),
      durationSeconds: duration
    };

    // Save and send to Teacher & Google Sheets
    googleSheetsService.enqueueDrawingResult(resultRecord);
    whiteboardSyncService.reportFinished({
      accuracy: finalAcc,
      score: earnedScore,
      drawingId: currentDrawing.id,
      drawingTitle: currentDrawing.title,
      durationSeconds: duration
    });
  };

  const handleToggleButton = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastButtonTriggerRef.current < 2000) {
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
  }, [brushColor, brushSize, currentDrawing.id, currentDrawing.title, currentDrawing.tolerance]);

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
    if (inputMethodRef.current !== 'touch_mouse') return;
    if (!isSessionActiveRef.current || isFinishedRef.current || !userDrawCanvasRef.current) return;
    
    isPointerDownRef.current = true;
    setIsPenDown(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (coords) {
      processDrawPoint(coords.px, coords.py);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputMethodRef.current !== 'touch_mouse') return;
    if (!isPointerDownRef.current || !isSessionActiveRef.current || isFinishedRef.current || !userDrawCanvasRef.current) return;

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (coords) {
      processDrawPoint(coords.px, coords.py);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputMethodRef.current !== 'touch_mouse') return;
    isPointerDownRef.current = false;
    setIsPenDown(false);
    lastDrawPosRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    flushAccuracyUpdate();
  };

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
      const screenPos = getScreenCoordinatesFromNormalized(data.indexTip.x, data.indexTip.y);

      if (screenPos) {
        // Generous padding around the button (45px)
        isOverButton = (
          screenPos.screenX >= btnRect.left - 45 &&
          screenPos.screenX <= btnRect.right + 45 &&
          screenPos.screenY >= btnRect.top - 45 &&
          screenPos.screenY <= btnRect.bottom + 45
        );
      }
      setIsHoveringButton(isOverButton);
    } else {
      setIsHoveringButton(false);
    }

    // Reset pinch release guard when student opens fingers
    if (!data.isPinching) {
      pinchMustReleaseRef.current = false;
    }

    const now = Date.now();
    const canTriggerButton = (now - lastButtonTriggerRef.current > 2000) && !pinchMustReleaseRef.current;

    // Interaction A: Over Action Button (2-finger pinch or 0.7s dwell inside the video)
    if (isOverButton) {
      const isTwoFingerPinchOverBtn = (data.isPinching || data.isTwoFingerOnlyPinch);
      if (isTwoFingerPinchOverBtn && canTriggerButton) {
        dwellStartTimeRef.current = null;
        setDwellProgress(100);
        setButtonFeedback(true);
        pinchMustReleaseRef.current = true;
        lastButtonTriggerRef.current = now;
        setTimeout(() => setButtonFeedback(false), 500);
        audioService.playPopSound();
        handleToggleButton(true);
      } else if (!dwellStartTimeRef.current) {
        dwellStartTimeRef.current = now;
      } else {
        const elapsed = now - dwellStartTimeRef.current;
        const progress = Math.min(100, Math.round((elapsed / 700) * 100)); // 0.7s dwell
        setDwellProgress(progress);
        if (elapsed >= 700 && canTriggerButton) {
          dwellStartTimeRef.current = null;
          setDwellProgress(0);
          setButtonFeedback(true);
          pinchMustReleaseRef.current = true;
          lastButtonTriggerRef.current = now;
          setTimeout(() => setButtonFeedback(false), 500);
          audioService.playPopSound();
          handleToggleButton(true);
        }
      }
    } else {
      dwellStartTimeRef.current = null;
      setDwellProgress(0);
    }

    // Interaction B: Air Pinch Gesture (Only when NOT over button)
    // When session is NOT active: 2-finger pinch held for 1.0s starts session
    // When session IS active: Air-pinch is disabled to completely prevent conflict with drawing!
    if (!isOverButton) {
      if (!isSessionActiveRef.current) {
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
              setButtonFeedback(true);
              setTimeout(() => setButtonFeedback(false), 500);
              audioService.playPopSound();
              handleToggleButton(true);
            }
          }
        } else {
          airPinchStartTimeRef.current = null;
          if (!isOverButton) {
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
      return;
    }

    // Map point to user draw canvas
    if (userDrawCanvasRef.current) {
      const activePoint = data.activeDrawPoint || data.threeFingerCentroid || data.indexTip;
      if (activePoint) {
        const px = activePoint.x * userDrawCanvasRef.current.width;
        const py = activePoint.y * userDrawCanvasRef.current.height;

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
  }, [brushColor, handleToggleButton, processDrawPoint]);

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

          {/* Toggle Input Method: 1. Hand Tracking vs 2. Whiteboard Touch/Mouse */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-700/80 shadow-inner">
            <button
              onClick={() => {
                if (inputMethod !== 'hand') {
                  setInputMethod('hand');
                  audioService.speakArabic('وضع تتبع حركة اليد أمام الكاميرا');
                }
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                inputMethod === 'hand'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="النوع الأول: تتبع حركة اليد أمام الكاميرا ✋"
            >
              <Hand className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تتبع اليد ✋</span>
              <span className="sm:hidden">يد</span>
            </button>
            <button
              onClick={() => {
                if (inputMethod !== 'touch_mouse') {
                  setInputMethod('touch_mouse');
                  audioService.speakArabic('السبورة البيضاء: يمكنك الآن الرسم باللمس أو بالفأرة');
                }
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                inputMethod === 'touch_mouse'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="النوع الثاني: السبورة البيضاء (لمس / ماوس) 🖌️"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">فأرة / لمس 🖱️</span>
              <span className="sm:hidden">لمس</span>
            </button>
          </div>

          {/* Toggle Video Feed (only in hand mode) */}
          {inputMethod === 'hand' && (
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
            height: `${stageDimensions.height}px`
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
              showVideo && inputMethod === 'hand' ? 'opacity-90' : 'opacity-0'
            }`}
            style={{
              filter: 'brightness(1.35) contrast(1.15) saturate(1.15)'
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

          {/* Interactive In-Canvas Button (Start / Finish Session - Single word with icon) */}
          {flowState === 'drawing' && (
            <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-50 flex flex-col items-end gap-1.5 pointer-events-auto">
              <button
                ref={actionButtonRef}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleButton();
                }}
                className={`relative overflow-hidden px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl border-2 flex items-center gap-2 transition-all duration-200 cursor-pointer shadow-2xl backdrop-blur-md select-none ${
                  buttonFeedback
                    ? 'scale-95 ring-8 ring-amber-400 bg-amber-400 text-slate-950'
                    : !isSessionActive
                    ? isHoveringButton
                      ? 'bg-emerald-900/95 border-emerald-400 text-emerald-100 scale-105 ring-4 ring-emerald-400/60 shadow-emerald-500/40 animate-pulse'
                      : 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200 hover:bg-emerald-900/90'
                    : isHoveringButton
                    ? 'bg-rose-900/95 border-rose-400 text-rose-100 scale-105 ring-4 ring-rose-400/60 shadow-rose-500/40 animate-pulse'
                    : 'bg-rose-950/90 border-rose-500/80 text-rose-200 hover:bg-rose-900/90'
                }`}
              >
                {/* Dwell Progress bar */}
                {dwellProgress > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 h-1.5 bg-amber-400 transition-all duration-75"
                    style={{ width: `${dwellProgress}%` }}
                  />
                )}
                {!isSessionActive ? (
                  <>
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold shadow shrink-0">
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ml-0.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-black text-emerald-100 leading-none">
                      ابدأ
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center font-bold shadow shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <span className="text-xs sm:text-sm font-black text-rose-100 leading-none">
                      إنهاء
                    </span>
                  </>
                )}
              </button>

              {/* Hand Mode Hint badge */}
              {inputMethod === 'hand' && (
                <div className="px-2.5 py-1 rounded-xl bg-slate-900/95 border border-slate-700/80 text-[11px] text-amber-300 font-bold backdrop-blur-md shadow-lg flex items-center gap-1.5 select-none animate-in fade-in duration-150">
                  <span>ضم إصبعين 🤏 في الهواء أو أشر للزر</span>
                </div>
              )}
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

          {/* Congratulations Modal Overlay */}
          {isFinished && (
            <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30 animate-bounce">
                <Sparkles className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-amber-400 mb-2">
                أحسنت يا {studentName}! 🌟
              </h2>
              <p className="text-slate-300 text-sm max-w-sm mb-4">
                تم إكمال رسمة «{currentDrawing.title}» بنجاح وتسجيل درجتك باسمك (#{studentNumber}) للمعلم!
              </p>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-6 mb-6">
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
              <button
                onClick={clearCanvas}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة المحاولة من جديد</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
