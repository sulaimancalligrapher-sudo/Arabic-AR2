import React, { useEffect, useRef, useState, useCallback } from 'react';
import { handTrackingService, HandData, PinchSensitivity } from '../services/handTrackingService';
import { audioService } from '../services/audioService';
import confetti from 'canvas-confetti';
import {
  X,
  Camera,
  Sun,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  MousePointer,
  Activity,
  Sliders
} from 'lucide-react';

interface HandCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToMouseMode?: () => void;
}

export const HandCalibrationModal: React.FC<HandCalibrationModalProps> = ({
  isOpen,
  onClose,
  onSwitchToMouseMode
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Statuses
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [isThreeFingerPinching, setIsThreeFingerPinching] = useState(false);
  const [detectedGesture, setDetectedGesture] = useState<string>('no_hand');
  const [pinchDistance, setPinchDistance] = useState<number>(0.5);
  const [pinchRatio, setPinchRatio] = useState<number>(1.0);
  const [fps, setFps] = useState<number>(0);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [hasSucceededPen, setHasSucceededPen] = useState(false);

  // Brightness Control (1.0 = normal, 1.5 = boosted, 2.0 = bright, 2.5 = ultra)
  const [brightness, setBrightness] = useState<number>(1.5);
  // Sensitivity Control
  const [sensitivity, setSensitivity] = useState<PinchSensitivity>('easy');

  // Practice targets
  const [balloons, setBalloons] = useState([
    { id: 1, letter: 'أ', x: 25, y: 30, popped: false, color: 'bg-amber-500' },
    { id: 2, letter: 'ب', x: 50, y: 25, popped: false, color: 'bg-emerald-500' },
    { id: 3, letter: 'ت', x: 75, y: 35, popped: false, color: 'bg-sky-500' }
  ]);

  // Practice draggable block
  const [blockPos, setBlockPos] = useState({ x: 50, y: 70 });
  const [isHoldingBlock, setIsHoldingBlock] = useState(false);
  const [hasSucceededDrag, setHasSucceededDrag] = useState(false);

  // Synchronous Refs to avoid React stale closure during 60FPS hand tracking loops
  const isHoldingBlockRef = useRef(false);
  const blockPosRef = useRef({ x: 50, y: 70 });
  const hoverGrabTimerRef = useRef(0);
  const handleHandDataRef = useRef<(data: HandData) => void>(() => {});

  // Start tracking when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setCameraStatus('starting');
    setErrorMessage(null);

    const init = async () => {
      if (!videoRef.current) return;

      const res = await handTrackingService.startTracking(videoRef.current, (data: HandData) => {
        if (!isMounted) return;
        // Always invoke the latest fresh callback via ref
        handleHandDataRef.current(data);
      });

      if (isMounted) {
        if (res.success) {
          setCameraStatus('active');
        } else {
          setCameraStatus('error');
          setErrorMessage(res.error || 'تعذر تشغيل الكاميرا أو نموذج تتبع اليد');
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      handTrackingService.stopTracking();
    };
  }, [isOpen]);

  // Adjust video brightness
  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    handTrackingService.setBrightnessMultiplier(val);
    if (videoRef.current) {
      videoRef.current.style.filter = `brightness(${val}) contrast(1.15) saturate(1.15)`;
    }
  };

  // Adjust sensitivity
  const handleSensitivityChange = (lvl: PinchSensitivity) => {
    setSensitivity(lvl);
    handTrackingService.setSensitivity(lvl);
  };

  // Handle incoming frame data
  const handleHandData = useCallback((data: HandData) => {
    setFps(data.fps || 0);

    if (!data.indexTip) {
      setHandDetected(false);
      setIsPinching(false);
      setIsThreeFingerPinching(false);
      setDetectedGesture('no_hand');
      if (isHoldingBlock) {
        setIsHoldingBlock(false);
      }
      // Clear canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    setHandDetected(true);
    setIsPinching(data.isPinching);
    setIsThreeFingerPinching(data.isThreeFingerPinching);
    setDetectedGesture(data.gesture);
    setPinchDistance(data.pinchDistance);
    setPinchRatio(data.pinchRatio);
    setCursorPos({ x: data.indexTip.x, y: data.indexTip.y });

    if (data.isThreeFingerPinching && !hasSucceededPen) {
      setHasSucceededPen(true);
      audioService.playChime();
    }

    // Draw full 21-point hand skeleton on canvas
    if (canvasRef.current && data.landmarks) {
      const cvs = canvasRef.current;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, cvs.width, cvs.height);

        // Connections between landmarks (bones)
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [0, 9], [9, 10], [10, 11], [11, 12], // Middle
          [0, 13], [13, 14], [14, 15], [15, 16], // Ring
          [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
          [5, 9], [9, 13], [13, 17] // Palm base
        ];

        // Draw bone lines
        ctx.lineWidth = 3;
        ctx.strokeStyle = data.isThreeFingerPinching ? '#10b981' : data.isPinching ? '#06b6d4' : '#f59e0b';
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

          if (data.isThreeFingerPinching) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#10b981';
            ctx.stroke();
          } else {
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Draw line between thumb and index tip to show pinch distance
        if (data.thumbTip && data.indexTip && !data.isThreeFingerPinching) {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = data.isPinching ? '#10b981' : '#f43f5e';
          ctx.moveTo(data.thumbTip.x * cvs.width, data.thumbTip.y * cvs.height);
          ctx.lineTo(data.indexTip.x * cvs.width, data.indexTip.y * cvs.height);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw points
        data.landmarks.forEach((pt, idx) => {
          ctx.beginPath();
          const px = pt.x * cvs.width;
          const py = pt.y * cvs.height;
          if (idx === 8) {
            // Index tip
            ctx.arc(px, py, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#0284c7';
          } else if (idx === 4) {
            // Thumb tip
            ctx.arc(px, py, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#eab308';
          } else if (idx === 12) {
            // Middle tip
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4';
          } else {
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          }
          ctx.fill();
        });
      }
    }

    // Interactive target 1: Burst balloons by touching with index tip
    const curXPercent = data.indexTip.x * 100;
    const curYPercent = data.indexTip.y * 100;

    setBalloons(prev =>
      prev.map(b => {
        if (!b.popped) {
          const dist = Math.hypot(curXPercent - b.x, curYPercent - b.y);
          if (dist < 12) {
            audioService.playSuccessSound();
            return { ...b, popped: true };
          }
        }
        return b;
      })
    );

    // Interactive target 2: Drag practice block
    const blockDist = Math.hypot(curXPercent - blockPosRef.current.x, curYPercent - blockPosRef.current.y);
    const isNearBlock = blockDist < 20;

    if (isNearBlock) {
      hoverGrabTimerRef.current++;
      // Can be grabbed via Pinch (data.isPinching) OR Dwell Hover (> 16 frames / 250ms)
      if ((data.isPinching || hoverGrabTimerRef.current > 16) && !isHoldingBlockRef.current) {
        isHoldingBlockRef.current = true;
        setIsHoldingBlock(true);
        audioService.playGrabSound();
      }
    } else if (!isHoldingBlockRef.current) {
      hoverGrabTimerRef.current = 0;
    }

    if (isHoldingBlockRef.current) {
      blockPosRef.current = { x: curXPercent, y: curYPercent };
      setBlockPos({ x: curXPercent, y: curYPercent });

      // Release condition when opening fingers
      if (!data.isPinching && hoverGrabTimerRef.current === 0) {
        isHoldingBlockRef.current = false;
        setIsHoldingBlock(false);
        audioService.playReleaseSound();
        setHasSucceededDrag(true);
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
      }
    }
  }, []);

  // Keep ref synchronized
  handleHandDataRef.current = handleHandData;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-serif">
                مختبر فحص ومعايرة تتبع اليد والكاميرا
              </h3>
              <p className="text-xs text-slate-400">
                اختبر استجابة الكاميرا، وضوح الإضاءة، وتجربة القبضة (Pinch) قبل بدء الدروس
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Split View */}
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
          
          {/* Left/Main Column: Camera Viewfinder & Interaction Canvas */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            
            {/* Viewfinder Container (100% Opacity Video, No Dark Blending) */}
            <div className="relative w-full aspect-4/3 rounded-2xl bg-slate-900 border-2 border-slate-700 overflow-hidden flex items-center justify-center shadow-xl">
              
              {/* Live Video (100% Opaque & Enhanced Exposure) */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300"
                style={{
                  opacity: 1.0,
                  filter: `brightness(${brightness}) contrast(1.15) saturate(1.15)`
                }}
              />

              {/* Hand Landmarks Skeleton Canvas */}
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />

              {/* Interactive Test Targets Overlay */}
              <div className="absolute inset-0 z-20 pointer-events-none">
                
                {/* 1. Test Balloons (Touch with index finger to pop!) */}
                {balloons.map(b => (
                  <div
                    key={b.id}
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                      b.popped ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-full ${b.color} text-slate-950 font-serif text-xl font-bold flex items-center justify-center shadow-2xl border-2 border-white ring-4 ring-white/30 animate-bounce`}>
                      {b.letter}
                    </div>
                    <span className="text-[10px] font-bold text-white bg-slate-900/90 px-1.5 py-0.5 rounded-full block text-center mt-1 border border-white/20">
                      المسني 👆
                    </span>
                  </div>
                ))}

                {/* 2. Draggable Test Coin / Block (Pinch to grab!) */}
                <div
                  style={{ left: `${blockPos.x}%`, top: `${blockPos.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 flex flex-col items-center ${
                    isHoldingBlock ? 'scale-115' : 'scale-100'
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl shadow-2xl border-2 transition-colors ${
                      isHoldingBlock
                        ? 'bg-emerald-400 border-white text-slate-950 ring-4 ring-emerald-500/40 shadow-emerald-500/50'
                        : 'bg-amber-400 border-amber-300 text-slate-950'
                    }`}
                  >
                    {isHoldingBlock ? '✊ مقبوض' : '🪙 اقبض'}
                  </div>
                  <span className="text-[10px] font-bold text-amber-300 bg-slate-950/80 px-2 py-0.5 rounded-full mt-1 border border-amber-500/30">
                    {isHoldingBlock ? 'اسحبني الآن!' : 'اقبض بالسبابة والإبهام (Pinch)'}
                  </span>
                </div>

                {/* 3. Pen Grip Practice Indicator */}
                <div
                  className={`absolute bottom-3 right-3 p-2.5 rounded-xl border text-xs flex items-center gap-2 backdrop-blur-md transition-all ${
                    isThreeFingerPinching
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400/30 scale-105'
                      : 'bg-slate-900/80 border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="text-base">{isThreeFingerPinching ? '✍️' : '✏️'}</span>
                  <div>
                    <div className="font-bold text-[11px]">
                      {isThreeFingerPinching ? 'مسكة القلم نشطة (ضم 3 أصابع) ✓' : 'اختبار مسكة القلم (3 أصابع)'}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {isThreeFingerPinching ? 'جاهز للرسم بالاستوديو!' : 'ضم الإبهام والسبابة والوسطى'}
                    </div>
                  </div>
                </div>

                {/* Index Cursor Indicator */}
                {handDetected && (
                  <div
                    style={{
                      left: `${cursorPos.x * 100}%`,
                      top: `${cursorPos.y * 100}%`
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  >
                    <div
                      className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shadow-lg ${
                        isPinching
                          ? 'border-emerald-400 bg-emerald-500/50 scale-110'
                          : 'border-sky-400 bg-sky-500/40'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-white shadow" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status / Instructions Overlay if not detected */}
              {!handDetected && cameraStatus === 'active' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-amber-500/90 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-xl animate-bounce">
                  <AlertTriangle className="w-4 h-4" />
                  <span>ضع كف يدك بوضوح أمام الكاميرا على بعد 40-70 سم 🖐️</span>
                </div>
              )}

              {/* Camera Starting Spinner */}
              {cameraStatus === 'starting' && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 z-30">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs font-semibold text-white">جارٍ تهيئة الكاميرا ونموذج التعرف على اليد...</p>
                </div>
              )}

              {/* Camera Error Display */}
              {cameraStatus === 'error' && (
                <div className="absolute inset-0 bg-rose-950/90 p-6 flex flex-col items-center justify-center text-center gap-3 z-30">
                  <AlertTriangle className="w-10 h-10 text-rose-400" />
                  <h4 className="text-sm font-bold text-white">تعذر تشغيل الكاميرا</h4>
                  <p className="text-xs text-rose-200 max-w-sm">{errorMessage}</p>
                  <button
                    onClick={() => {
                      if (onSwitchToMouseMode) onSwitchToMouseMode();
                      onClose();
                    }}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg"
                  >
                    <MousePointer className="w-4 h-4" />
                    <span>المتابعة بوضع الماوس واللمس</span>
                  </button>
                </div>
              )}
            </div>

            {/* Brightness & Exposure Toolbar */}
            <div className="flex flex-wrap items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 gap-3">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">إضاءة وتفتيح الكاميرا:</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: '100% (طبيعي)', val: 1.0 },
                  { label: '150% (مشرق ☀️)', val: 1.5 },
                  { label: '200% (فائق الإضاءة 💡)', val: 2.0 },
                  { label: '250% (إضاءة ليلية ⚡)', val: 2.5 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => handleBrightnessChange(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      brightness === opt.val
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'bg-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Diagnostics Checklist & Sensitivity Controls */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Live Diagnostics Card */}
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>مؤشرات الفحص المباشر</span>
                </h4>
                <span className="text-[10px] font-mono text-slate-400">{fps} FPS</span>
              </div>

              {/* Status List */}
              <div className="space-y-2 text-xs">
                {/* 1. Camera */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                  <span className="text-slate-300">كاميرا الويب:</span>
                  <span className={cameraStatus === 'active' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {cameraStatus === 'active' ? 'نشطة ومتصلة ✓' : 'جارٍ الفحص...'}
                  </span>
                </div>

                {/* 2. Hand Detection */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                  <span className="text-slate-300">التعرف على كف اليد:</span>
                  <span className={handDetected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {handDetected ? 'مكتشفة بنجاح 🖐️' : 'غير ظاهرة ❌'}
                  </span>
                </div>

                {/* 3. The 3 Core Gestures Status */}
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/60 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1">
                    حالات التفاعل الثلاث الأساسية:
                  </div>

                  {/* Gesture 1: 1 finger pointing */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <span>☝️</span>
                      <span>إصبع واحد (السبابة):</span>
                    </span>
                    <span className={detectedGesture === 'pointing' ? 'text-sky-400 font-bold' : 'text-slate-500'}>
                      {detectedGesture === 'pointing' ? 'مؤشر واختيار نشط' : 'إشارة'}
                    </span>
                  </div>

                  {/* Gesture 2: 2 fingers pinch */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <span>🤏</span>
                      <span>إصبعان (سبابة وإبهام):</span>
                    </span>
                    <span className={isPinching && !isThreeFingerPinching ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {isPinching && !isThreeFingerPinching ? 'قبض وسحب نشط' : 'مسك الأشياء'}
                    </span>
                  </div>

                  {/* Gesture 3: 3 fingers pen grip */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <span>✍️</span>
                      <span>3 أصابع (مسكة القلم):</span>
                    </span>
                    <span className={isThreeFingerPinching ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {isThreeFingerPinching ? 'رسم بالقلم نشط ✍️' : 'رسم وكتابة'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pinch Sensitivity Preset Selector */}
              <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>حساسية القبض والسحب:</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'easy', label: 'سهلة جداً 🟢' },
                    { id: 'normal', label: 'متوسطة 🟡' },
                    { id: 'strict', label: 'دقيقة 🔵' }
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSensitivityChange(s.id as PinchSensitivity)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                        sensitivity === s.id
                          ? 'bg-amber-500 text-slate-950 font-bold shadow'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pinch Distance Bar Gauge */}
              <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">مقياس المسافة الحية للقبضة:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {pinchDistance < 1 ? pinchDistance.toFixed(3) : '-'} (نسبة: {pinchRatio < 2 ? pinchRatio.toFixed(2) : '-'})
                  </span>
                </div>
                
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      isPinching ? 'bg-emerald-500 shadow-md shadow-emerald-500/50' : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(8, pinchDistance * 280))}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>قبضة (Pinch) 🤏</span>
                  <span>إفلات (Open) ✋</span>
                </div>
              </div>

            </div>

            {/* Practical Test Goals Checklist */}
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>أهداف المعايرة السريعة:</span>
              </h4>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${balloons.some(b => b.popped) ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className={balloons.some(b => b.popped) ? 'text-white' : 'text-slate-400'}>
                    ☝️ لمس الحروف الطافية بإصبع السبابة (اختيار)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${hasSucceededDrag ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className={hasSucceededDrag ? 'text-white' : 'text-slate-400'}>
                    🤏 تجربة قبضة اليد وسحب الرمز (إصبعان)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${hasSucceededPen ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className={hasSucceededPen ? 'text-white' : 'text-slate-400'}>
                    ✍️ تجربة مسك القلم بضم 3 أصابع (رسم)
                  </span>
                </div>
              </div>

              {(hasSucceededDrag || hasSucceededPen) && (
                <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center">
                  🎉 رائع! تم فحص حركات اليد والقلم بنجاح!
                </div>
              )}
            </div>

            {/* Quick Tips Box */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>إرشادات للحصول على أعلى دقة:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                <li>اجعل باطن كف اليد مواجهاً لعدسة الكاميرا.</li>
                <li>تأكد من أن مسافة يدك تبعد حوالي 40 إلى 70 سم.</li>
                <li>إذا كانت الغرفة مظلمة، استخدم خيار "200% فائق الإضاءة" أعلاه.</li>
              </ul>
            </div>

          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-800/40 flex items-center justify-between">
          <button
            onClick={() => {
              if (onSwitchToMouseMode) onSwitchToMouseMode();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <MousePointer className="w-3.5 h-3.5 text-amber-400" />
            <span>التبديل إلى الماوس واللمس</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition-all"
          >
            إتمام المعايرة والبدء في الدروس ←
          </button>
        </div>

      </div>
    </div>
  );
};
