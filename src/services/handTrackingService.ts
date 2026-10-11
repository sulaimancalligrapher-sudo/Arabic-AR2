/**
 * Hand Tracking Service using MediaPipe Hands
 * - Tracks 21 hand landmarks
 * - Computes Index Finger Tip (Landmark 8) for virtual cursor
 * - Computes Thumb Tip (Landmark 4) to Index Tip distance for Pinch detection
 * - Implements Palm-Width Normalization to make Pinch detection scale-invariant
 * - Configurable sensitivity presets (easy, normal, strict)
 * - Implements smoothing formula: cursor += (target - cursor) * 0.35
 * - Strictly manages camera lifecycle (starts only during AR activities, stops immediately after)
 * - Enhanced camera illumination and exposure controls
 */

export interface HandData {
  indexTip: { x: number; y: number } | null;
  thumbTip: { x: number; y: number } | null;
  middleTip: { x: number; y: number } | null;
  ringTip: { x: number; y: number } | null;
  pinkyTip: { x: number; y: number } | null;
  wrist: { x: number; y: number } | null;

  // 2-finger pinch (Thumb + Index) - For grabbing & moving items
  isPinching: boolean;
  isTwoFingerOnlyPinch: boolean; // Pure two-finger pinch (Thumb + Index only; middle finger NOT clustered)
  pinchDistance: number;
  pinchRatio: number;

  // 3-finger pinch (Thumb + Index + Middle) - For holding a pen & drawing ✍️
  isThreeFingerPinching: boolean;
  threeFingerSpread: number;
  threeFingerRatio: number;
  threeFingerCentroid: { x: number; y: number } | null;

  // Smart Latch State Machine (Locks drawing ON when 3 fingers joined; only releases when fingers spread)
  isLatched: boolean;
  isThreeFingerLatched: boolean;
  activeDrawPoint: { x: number; y: number } | null;

  // Active detected gesture
  gesture: 'pointing' | 'two_finger_pinch' | 'three_finger_pen' | 'open_hand' | 'fist' | 'no_hand';
  isFist: boolean;

  landmarks: Array<{ x: number; y: number; z: number }> | null;
  lastUpdated: number;
  fps: number;
  estimatedLightLevel: 'dark' | 'good' | 'bright';
  isMobileOptimized?: boolean;
  videoDimensions?: { width: number; height: number; aspect: number };
}

export type HandCallback = (data: HandData) => void;
export type PinchSensitivity = 'easy' | 'normal' | 'strict';
export type DrawingGestureMode =
  | 'three_finger_latch'
  | 'three_finger_pinch'
  | 'three_finger'
  | 'two_finger_latch'
  | 'two_finger_pinch'
  | 'two_finger'
  | 'continuous'
  | 'index_continuous';

class HandTrackingService {
  private hands: any = null;
  private camera: any = null;
  private videoElement: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private isRunning: boolean = false;
  private callback: HandCallback | null = null;
  private isProcessingFrame: boolean = false;
  private isMobileOrTablet: boolean = false;
  private videoDimensions: { width: number; height: number; aspect: number } = {
    width: 640,
    height: 480,
    aspect: 640 / 480
  };

  // Smart Latch Drawing State
  private isLatched: boolean = false;
  private drawingGestureMode: DrawingGestureMode = 'three_finger_latch';
  private lastHandSeenTime: number = 0;
  private readonly HAND_LOST_GRACE_MS: number = 1000; // 1s grace buffer against camera flicker

  // 2-Finger Pinch Sensitivity Thresholds
  private pinchOnThreshold: number = 0.11;
  private pinchOffThreshold: number = 0.145;
  private currentPinchState: boolean = false;

  // 3-Finger Pen Grip Thresholds (Thumb + Index + Middle)
  private threeFingerOnThreshold: number = 0.058;
  private threeFingerOffThreshold: number = 0.095;
  private threeFingerOnRatio: number = 0.40;
  private threeFingerOffRatio: number = 0.65;
  private currentThreeFingerState: boolean = false;

  private sensitivity: PinchSensitivity = 'easy';

  // Smoothed cursor coordinates
  private smoothedX: number = 0.5;
  private smoothedY: number = 0.5;
  private smoothedCentroidX: number = 0.5;
  private smoothedCentroidY: number = 0.5;
  private readonly SMOOTHING_FACTOR = 0.35;

  // FPS & Diagnostics
  private frameCount: number = 0;
  private lastFpsCalcTime: number = Date.now();
  private currentFps: number = 0;
  private lightLevel: 'dark' | 'good' | 'bright' = 'good';
  private isPaused: boolean = false;

  // Brightness filter level (1.0 = normal, 1.5 = boosted, 2.0 = extra bright, 2.5 = max)
  private brightnessMultiplier: number = 1.5;

  private latestData: HandData = {
    indexTip: null,
    thumbTip: null,
    middleTip: null,
    ringTip: null,
    pinkyTip: null,
    wrist: null,
    isPinching: false,
    isTwoFingerOnlyPinch: false,
    pinchDistance: 1.0,
    pinchRatio: 1.0,
    isThreeFingerPinching: false,
    threeFingerSpread: 1.0,
    threeFingerRatio: 1.0,
    threeFingerCentroid: null,
    isLatched: false,
    isThreeFingerLatched: false,
    activeDrawPoint: null,
    gesture: 'no_hand',
    isFist: false,
    landmarks: null,
    lastUpdated: 0,
    fps: 0,
    estimatedLightLevel: 'good',
    isMobileOptimized: false
  };

  /**
   * Set drawing gesture mode
   */
  public setDrawingGestureMode(mode: DrawingGestureMode) {
    this.drawingGestureMode = mode;
    if (mode === 'continuous') {
      this.isLatched = true;
    } else {
      this.isLatched = false;
    }
  }

  public getDrawingGestureMode(): DrawingGestureMode {
    return this.drawingGestureMode;
  }

  public resetLatch() {
    this.isLatched = false;
    this.currentThreeFingerState = false;
    this.currentPinchState = false;
    this.lastHandSeenTime = 0;
    this.latestData.isLatched = false;
    this.latestData.isThreeFingerLatched = false;
    this.latestData.landmarks = null;
    this.latestData.indexTip = null;
    this.latestData.activeDrawPoint = null;
    this.latestData.gesture = 'no_hand';
  }

  /**
   * Set pinch & pen grip sensitivity
   */
  public setSensitivity(level: PinchSensitivity) {
    this.sensitivity = level;
    if (level === 'easy') {
      this.pinchOnThreshold = 0.115;
      this.pinchOffThreshold = 0.16;
      this.threeFingerOnThreshold = 0.068;
      this.threeFingerOffThreshold = 0.105;
      this.threeFingerOnRatio = 0.46;
      this.threeFingerOffRatio = 0.70;
    } else if (level === 'normal') {
      this.pinchOnThreshold = 0.095;
      this.pinchOffThreshold = 0.135;
      this.threeFingerOnThreshold = 0.058;
      this.threeFingerOffThreshold = 0.095;
      this.threeFingerOnRatio = 0.40;
      this.threeFingerOffRatio = 0.65;
    } else {
      this.pinchOnThreshold = 0.075;
      this.pinchOffThreshold = 0.11;
      this.threeFingerOnThreshold = 0.048;
      this.threeFingerOffThreshold = 0.085;
      this.threeFingerOnRatio = 0.35;
      this.threeFingerOffRatio = 0.58;
    }
  }

  public getSensitivity(): PinchSensitivity {
    return this.sensitivity;
  }

  /**
   * Dynamically ensure MediaPipe scripts are loaded from CDN if not yet on window
   */
  public async ensureMediaPipeLoaded(): Promise<boolean> {
    if ((window as any).Hands && (window as any).Camera) {
      return true;
    }

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
      return !!((window as any).Hands);
    } catch (err) {
      console.error('MediaPipe CDN load failed:', err);
      return false;
    }
  }

  /**
   * Set brightness enhancement multiplier
   */
  public setBrightnessMultiplier(val: number) {
    this.brightnessMultiplier = val;
    if (this.videoElement) {
      this.videoElement.style.filter = `brightness(${val}) contrast(1.15) saturate(1.15)`;
    }
  }

  public getBrightnessMultiplier(): number {
    return this.brightnessMultiplier;
  }

  /**
   * Check if camera is available in navigator
   */
  public async checkCameraSupport(): Promise<boolean> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(d => d.kind === 'videoinput');
    } catch {
      return true;
    }
  }

  /**
   * Start tracking on specified video element
   */
  public async startTracking(
    videoEl: HTMLVideoElement,
    onHandData: HandCallback
  ): Promise<{ success: boolean; error?: string }> {
    this.callback = onHandData;
    this.videoElement = videoEl;

    // Detect mobile or tablet devices for turbo performance tuning
    this.isMobileOrTablet =
      typeof window !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) ||
        window.innerWidth <= 840);

    // Apply brightness enhancement filter to video immediately
    this.videoElement.style.filter = `brightness(${this.brightnessMultiplier}) contrast(1.15) saturate(1.15)`;

    try {
      // 1. Ensure library is loaded
      await this.ensureMediaPipeLoaded();

      const HandsClass = (window as any).Hands;
      if (!HandsClass) {
        throw new Error('لم يتم تحميل مكتبة MediaPipe Hands من المتصفح بنجاح.');
      }

      // 2. Initialize MediaPipe Hands if not already created
      if (!this.hands) {
        this.hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        // Use Lite model (complexity: 0) on mobile/tablet for 30+ FPS and high responsiveness
        // Use Full model (complexity: 1) on PC/Desktop
        this.hands.setOptions({
          maxNumHands: 1,
          modelComplexity: this.isMobileOrTablet ? 0 : 1,
          minDetectionConfidence: 0.72,
          minTrackingConfidence: 0.65
        });

        this.hands.onResults((results: any) => this.processResults(results));
      }

      // 3. Direct camera capture:
      // - Large desktop/PC screens: 1280x720 HD widescreen for large, expansive display with minimal margins
      // - Mobile & Tablets: 640x480 for lightweight, smooth 30 FPS performance
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'user',
          width: this.isMobileOrTablet ? { ideal: 640 } : { ideal: 1280 },
          height: this.isMobileOrTablet ? { ideal: 480 } : { ideal: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      this.videoElement.srcObject = stream;
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('webkit-playsinline', 'true');

      // Wait until video metadata is loaded
      await new Promise<void>((resolve) => {
        if (this.videoElement!.videoWidth > 0 && this.videoElement!.videoHeight > 0) {
          resolve();
        } else {
          this.videoElement!.onloadedmetadata = () => resolve();
        }
      });

      await this.videoElement.play();

      const updateDims = () => {
        if (!this.videoElement) return;
        const vWidth = this.videoElement.videoWidth || 640;
        const vHeight = this.videoElement.videoHeight || 480;
        this.videoDimensions = {
          width: vWidth,
          height: vHeight,
          aspect: vWidth / vHeight
        };
      };

      updateDims();
      this.videoElement.addEventListener('resize', updateDims);

      this.isRunning = true;

      // Efficient frame loop with zero queue backlog
      const processLoop = async () => {
        if (!this.isRunning || !this.videoElement || !this.hands) return;

        // If paused (e.g. Pure Whiteboard direct touch/mouse drawing mode), sleep to free 100% CPU/GPU
        if (this.isPaused) {
          if (this.isRunning && this.videoElement) {
            setTimeout(() => {
              if (this.isRunning && this.videoElement) {
                if ('requestVideoFrameCallback' in this.videoElement) {
                  (this.videoElement as any).requestVideoFrameCallback(processLoop);
                } else {
                  requestAnimationFrame(processLoop);
                }
              }
            }, 120);
          }
          return;
        }

        if (!this.isProcessingFrame && this.videoElement.readyState >= 2) {
          this.isProcessingFrame = true;
          try {
            this.updateFps();

            if (this.isMobileOrTablet) {
              // Solution 2: Lightweight internal processing downscale for mobile/tablet
              // The <video> element on screen remains 100% native full size & quality!
              // But the MediaPipe neural net processes a fast 360px feed, multiplying FPS and preventing device heat.
              if (!this.offscreenCanvas) {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false });
              }
              const aspect = this.videoDimensions.aspect || 1.333;
              const procW = 360;
              const procH = Math.max(180, Math.round(procW / aspect));
              if (this.offscreenCanvas.width !== procW || this.offscreenCanvas.height !== procH) {
                this.offscreenCanvas.width = procW;
                this.offscreenCanvas.height = procH;
              }
              if (this.offscreenCtx) {
                this.offscreenCtx.drawImage(this.videoElement, 0, 0, procW, procH);
                await this.hands.send({ image: this.offscreenCanvas });
              } else {
                await this.hands.send({ image: this.videoElement });
              }
            } else {
              await this.hands.send({ image: this.videoElement });
            }
          } catch {
            // Ignore transient frame send error
          } finally {
            this.isProcessingFrame = false;
          }
        }

        if (this.isRunning && this.videoElement) {
          if ('requestVideoFrameCallback' in this.videoElement) {
            (this.videoElement as any).requestVideoFrameCallback(processLoop);
          } else {
            requestAnimationFrame(processLoop);
          }
        }
      };

      if ('requestVideoFrameCallback' in this.videoElement) {
        (this.videoElement as any).requestVideoFrameCallback(processLoop);
      } else {
        requestAnimationFrame(processLoop);
      }

      return { success: true };
    } catch (err: any) {
      console.warn('Failed to start camera / hand tracking:', err);
      this.isRunning = false;
      return {
        success: false,
        error: err.name === 'NotAllowedError'
          ? 'تم رفض إذن الوصول للكاميرا من المتصفح. يمكنك إكمال النشاط بالماوس أو اللمس.'
          : 'تعذر تشغيل الكاميرا أو نموذج تتبع اليد. يمكنك استخدام الماوس أو اللمس كبديل مباشر.'
      };
    }
  }

  private updateFps() {
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime));
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
    }
  }

  /**
   * Process results from MediaPipe hands
   */
  private processResults(results: any) {
    if (!this.isRunning) return;

    // Validate presence and confidence: Discard phantom background detections
    const handedness = results.multiHandedness?.[0];
    const handScore = handedness?.score ?? (results.multiHandLandmarks?.length > 0 ? 0.85 : 0);

    if (
      results.multiHandLandmarks &&
      results.multiHandLandmarks.length > 0 &&
      handScore >= 0.70
    ) {
      const landmarks = results.multiHandLandmarks[0];

      // Landmark 8: Index Finger Tip
      // Landmark 4: Thumb Tip
      // Landmark 12: Middle Finger Tip
      // Landmark 16: Ring Finger Tip
      // Landmark 20: Pinky Finger Tip
      // Landmark 0: Wrist
      // Landmark 5: Index Knuckle (MCP)
      // Landmark 17: Pinky Knuckle (MCP)
      const rawIndex = landmarks[8];
      const rawThumb = landmarks[4];
      const rawMiddle = landmarks[12];
      const rawRing = landmarks[16];
      const rawPinky = landmarks[20];
      const rawWrist = landmarks[0];
      const rawIndexKnuckle = landmarks[5];
      const rawPinkyKnuckle = landmarks[17];

      // Aspect ratio correction for true isotropic euclidean distance
      const aspect = this.videoDimensions.aspect || 1;

      // Palm width (scale invariant reference with aspect correction)
      const palmDx = ((1 - rawPinkyKnuckle.x) - (1 - rawIndexKnuckle.x)) * aspect;
      const palmDy = rawPinkyKnuckle.y - rawIndexKnuckle.y;
      const palmWidth = Math.sqrt(palmDx * palmDx + palmDy * palmDy);

      // Anatomical validity check: Real human hand in camera range must have sensible palm scale
      // Reject noise/shadow artifacts where palm scale is deformed or microscopic
      if (palmWidth < 0.055 || palmWidth > 0.65) {
        this.clearToNoHand();
        return;
      }

      // Video is mirrored for natural interaction: x is flipped: 1 - x
      const targetX = 1 - rawIndex.x;
      const targetY = rawIndex.y;

      const thumbX = 1 - rawThumb.x;
      const thumbY = rawThumb.y;

      const middleX = 1 - rawMiddle.x;
      const middleY = rawMiddle.y;

      const ringX = 1 - rawRing.x;
      const ringY = rawRing.y;

      const pinkyX = 1 - rawPinky.x;
      const pinkyY = rawPinky.y;

      const wristX = 1 - rawWrist.x;
      const wristY = rawWrist.y;

      // Cursor smoothing formula:
      const smoothing = this.isMobileOrTablet ? 0.72 : 0.40;
      this.smoothedX += (targetX - this.smoothedX) * smoothing;
      this.smoothedY += (targetY - this.smoothedY) * smoothing;

      // 1. Two-Finger Pinch (Thumb Tip to Index Tip) - Used for clicking buttons in the air 🤏
      const dxThumbIndex = (thumbX - targetX) * aspect;
      const dyThumbIndex = thumbY - targetY;
      const rawDistance = Math.sqrt(dxThumbIndex * dxThumbIndex + dyThumbIndex * dyThumbIndex);
      const pinchRatio = rawDistance / palmWidth;

      // Direct Euclidean distance between thumb tip and index tip
      const directTipDistance = Math.hypot(thumbX - targetX, thumbY - targetY);

      const isCurrentlyClose2 =
        rawDistance < 0.135 ||
        directTipDistance < 0.11 ||
        pinchRatio < 0.82;

      const isCurrentlyFar2 =
        rawDistance > 0.175 &&
        directTipDistance > 0.14 &&
        pinchRatio > 0.98;

      if (this.currentPinchState) {
        if (isCurrentlyFar2) {
          this.currentPinchState = false;
        }
      } else {
        if (isCurrentlyClose2) {
          this.currentPinchState = true;
        }
      }

      // 2. Three-Finger Pen Grip (Thumb + Index + Middle) - For holding a pen & drawing ✍️
      const dxIndexMiddle = targetX - middleX;
      const dyIndexMiddle = targetY - middleY;
      const distIndexMiddle = Math.sqrt(dxIndexMiddle * dxIndexMiddle + dyIndexMiddle * dyIndexMiddle);

      const dxThumbMiddle = thumbX - middleX;
      const dyThumbMiddle = thumbY - middleY;
      const distThumbMiddle = Math.sqrt(dxThumbMiddle * dxThumbMiddle + dyThumbMiddle * dyThumbMiddle);

      // Max spread among the 3 tips
      const threeFingerSpread = Math.max(rawDistance, distIndexMiddle, distThumbMiddle);
      const threeFingerRatio = threeFingerSpread / palmWidth;

      // Centroid of the 3 fingertips
      const rawCentroidX = (thumbX + targetX + middleX) / 3;
      const rawCentroidY = (thumbY + targetY + middleY) / 3;
      const centroidSmoothing = this.isMobileOrTablet ? 0.75 : 0.40;
      this.smoothedCentroidX += (rawCentroidX - this.smoothedCentroidX) * centroidSmoothing;
      this.smoothedCentroidY += (rawCentroidY - this.smoothedCentroidY) * centroidSmoothing;

      // When the 3 fingers join together tightly in a pen grip (START condition ✍️):
      const isCurrentlyClose3 = threeFingerSpread < this.threeFingerOnThreshold && threeFingerRatio < this.threeFingerOnRatio;

      // When the 3 fingers spread apart explicitly (STOP condition ✋):
      // Only stops when fingers are clearly and visibly separated, preventing any mid-stroke accidental stop:
      const isCurrentlyFar3 = (
        threeFingerSpread > this.threeFingerOffThreshold &&
        distIndexMiddle > 0.085 &&
        distThumbMiddle > 0.085 &&
        rawDistance > 0.12
      ) || (threeFingerRatio > this.threeFingerOffRatio);

      if (this.currentThreeFingerState) {
        if (isCurrentlyFar3) {
          this.currentThreeFingerState = false;
        }
      } else {
        if (isCurrentlyClose3) {
          this.currentThreeFingerState = true;
        }
      }

      this.lastHandSeenTime = Date.now();

      // Pure Smart Latch State Machine (حالة القفل والتثبيت الكاملة):
      if (this.drawingGestureMode === 'three_finger_latch') {
        if (!this.isLatched) {
          if (isCurrentlyClose3) {
            this.isLatched = true;
          }
        } else {
          // Drawing remains locked ON even if a finger momentarily flickers or drops; only releases upon clear finger divergence
          if (isCurrentlyFar3) {
            this.isLatched = false;
          }
        }
      } else if (this.drawingGestureMode === 'two_finger_latch') {
        if (!this.isLatched) {
          if (isCurrentlyClose2) {
            this.isLatched = true;
          }
        } else {
          if (isCurrentlyFar2) {
            this.isLatched = false;
          }
        }
      } else if (this.drawingGestureMode === 'three_finger_pinch') {
        this.isLatched = this.currentThreeFingerState;
      } else if (this.drawingGestureMode === 'two_finger_pinch') {
        this.isLatched = this.currentPinchState;
      } else if (this.drawingGestureMode === 'continuous') {
        this.isLatched = true;
      }

      // Dedicated 2-finger-only pinch (Thumb + Index touching, Middle is NOT clustered):
      // Prevents 3-finger drawing pen grip from triggering 2-finger button clicks!
      const isTwoFingerOnlyPinch = this.currentPinchState && (
        distIndexMiddle > 0.075 ||
        distThumbMiddle > 0.085 ||
        rawMiddle.y > Math.max(rawIndex.y, rawThumb.y) + 0.035
      );

      // Active Draw Point: Resilient index tip
      const activeDrawPoint = { x: this.smoothedX, y: this.smoothedY };

      // 3. Gesture Classification
      let gesture: 'pointing' | 'two_finger_pinch' | 'three_finger_pen' | 'open_hand' | 'fist' | 'no_hand' = 'open_hand';
      if (this.currentThreeFingerState || (this.isLatched && this.drawingGestureMode.includes('three_finger'))) {
        gesture = 'three_finger_pen';
      } else if (isTwoFingerOnlyPinch) {
        gesture = 'two_finger_pinch';
      } else {
        const isIndexExtended = rawIndex.y < (landmarks[6]?.y ?? 1.0);
        const isMiddleFolded = rawMiddle.y > (landmarks[10]?.y ?? 0);
        if (isIndexExtended && (isMiddleFolded || rawDistance > 0.15)) {
          gesture = 'pointing';
        } else {
          gesture = 'open_hand';
        }
      }

      this.latestData = {
        indexTip: { x: this.smoothedX, y: this.smoothedY },
        thumbTip: { x: thumbX, y: thumbY },
        middleTip: { x: middleX, y: middleY },
        ringTip: { x: ringX, y: ringY },
        pinkyTip: { x: pinkyX, y: pinkyY },
        wrist: { x: wristX, y: wristY },
        isPinching: this.currentPinchState,
        isTwoFingerOnlyPinch,
        pinchDistance: rawDistance,
        pinchRatio,
        isThreeFingerPinching: this.currentThreeFingerState,
        threeFingerSpread,
        threeFingerRatio,
        threeFingerCentroid: { x: this.smoothedCentroidX, y: this.smoothedCentroidY },
        isLatched: this.isLatched,
        isThreeFingerLatched: this.isLatched,
        activeDrawPoint,
        gesture,
        isFist: false,
        landmarks: landmarks.map((pt: any) => ({ x: 1 - pt.x, y: pt.y, z: pt.z })),
        lastUpdated: Date.now(),
        fps: this.currentFps,
        estimatedLightLevel: this.lightLevel,
        isMobileOptimized: this.isMobileOrTablet,
        videoDimensions: this.videoDimensions
      };
    } else {
      this.clearToNoHand();
      return;
    }

    if (this.callback) {
      this.callback(this.latestData);
    }
  }

  /**
   * Helper to reset to no hand state immediately
   */
  private clearToNoHand() {
    this.isLatched = false;
    this.currentPinchState = false;
    this.currentThreeFingerState = false;
    this.latestData = {
      indexTip: null,
      thumbTip: null,
      middleTip: null,
      ringTip: null,
      pinkyTip: null,
      wrist: null,
      isPinching: false,
      isTwoFingerOnlyPinch: false,
      pinchDistance: 1.0,
      pinchRatio: 1.0,
      isThreeFingerPinching: false,
      threeFingerSpread: 1.0,
      threeFingerRatio: 1.0,
      threeFingerCentroid: null,
      isLatched: false,
      isThreeFingerLatched: false,
      activeDrawPoint: null,
      gesture: 'no_hand',
      isFist: false,
      landmarks: null,
      lastUpdated: Date.now(),
      fps: this.currentFps,
      estimatedLightLevel: this.lightLevel,
      isMobileOptimized: this.isMobileOrTablet,
      videoDimensions: this.videoDimensions
    };
    if (this.callback) {
      this.callback(this.latestData);
    }
  }

  /**
   * Pause MediaPipe frame sending to liberate 100% CPU/GPU for smooth direct touch/mouse drawing
   */
  public pauseProcessing() {
    this.isPaused = true;
  }

  /**
   * Resume MediaPipe frame processing immediately
   */
  public resumeProcessing() {
    this.isPaused = false;
  }

  /**
   * Stop tracking and release hardware camera tracks immediately
   */
  public stopTracking() {
    this.isRunning = false;
    this.callback = null;

    if (this.camera && typeof this.camera.stop === 'function') {
      try {
        this.camera.stop();
      } catch {
        // Ignore
      }
    }

    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.videoElement.srcObject = null;
    }

    this.latestData = {
      indexTip: null,
      thumbTip: null,
      middleTip: null,
      ringTip: null,
      pinkyTip: null,
      wrist: null,
      isPinching: false,
      isTwoFingerOnlyPinch: false,
      pinchDistance: 1.0,
      pinchRatio: 1.0,
      isThreeFingerPinching: false,
      threeFingerSpread: 1.0,
      threeFingerRatio: 1.0,
      threeFingerCentroid: null,
      isLatched: false,
      isThreeFingerLatched: false,
      activeDrawPoint: null,
      gesture: 'no_hand',
      isFist: false,
      landmarks: null,
      lastUpdated: 0,
      fps: 0,
      estimatedLightLevel: 'good',
      isMobileOptimized: false
    };
    this.currentPinchState = false;
    this.currentThreeFingerState = false;
  }

  public getLatestData(): HandData {
    return this.latestData;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const handTrackingService = new HandTrackingService();
