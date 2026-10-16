import { DrawingItem, DrawingTolerance } from '../types';
import { PRESET_DRAWINGS } from '../data/drawingData';

const CUSTOM_DRAWINGS_KEY = 'baseera_custom_drawings';

export interface ImageAnalysisResult {
  width: number;
  height: number;
  totalTargetPixels: number;
  targetMask: Uint8Array; // 1 = dark line pixel, 0 = background
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  cleanGuideUrl?: string; // High-contrast clean extracted guide line PNG
}

export interface GuideColorOption {
  id: 'yellow' | 'green' | 'white' | 'cyan' | 'black';
  name: string;
  hex: string;
  glow: string;
}

export const GUIDE_LINE_COLORS: GuideColorOption[] = [
  { id: 'yellow', name: 'أصفر نيون متوهج', hex: '#facc15', glow: 'rgba(250, 204, 21, 0.6)' },
  { id: 'green', name: 'أخضر فاتح فسفوري', hex: '#4ade80', glow: 'rgba(74, 222, 128, 0.6)' },
  { id: 'white', name: 'أبيض ناصع متوهج', hex: '#ffffff', glow: 'rgba(255, 255, 255, 0.7)' },
  { id: 'cyan', name: 'سماوي مشرق', hex: '#38bdf8', glow: 'rgba(56, 189, 248, 0.6)' },
  { id: 'black', name: 'أسود كلاسيكي', hex: '#0f172a', glow: 'rgba(0, 0, 0, 0.4)' }
];

class DrawingEngineService {
  /**
   * Load any image (URL, Data URI, SVG, Photo) and extract precise line mask
   * Uses dynamic background estimation and relative contrast to eliminate paper shadows & JPEG noise
   */
  public async loadAndAnalyzeImage(
    imageUrl: string,
    targetWidth: number = 700,
    targetHeight: number = 520
  ): Promise<ImageAnalysisResult> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // Clear transparent
          ctx.clearRect(0, 0, targetWidth, targetHeight);

          // Calculate aspect-ratio fit (leave 8% margin for comfortable drawing area)
          const imgAspect = img.width / img.height;
          const targetAspect = targetWidth / targetHeight;
          let drawW = targetWidth;
          let drawH = targetHeight;
          let drawX = 0;
          let drawY = 0;

          if (imgAspect > targetAspect) {
            drawW = targetWidth * 0.86;
            drawH = drawW / imgAspect;
            drawX = (targetWidth - drawW) / 2;
            drawY = (targetHeight - drawH) / 2;
          } else {
            drawH = targetHeight * 0.86;
            drawW = drawH * imgAspect;
            drawX = (targetWidth - drawW) / 2;
            drawY = (targetHeight - drawH) / 2;
          }

          // Draw image
          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
          const data = imgData.data;
          const totalPixels = targetWidth * targetHeight;
          const mask = new Uint8Array(totalPixels);

          // 1. Sample border pixels around drawn bounding box to estimate background luminance and transparency
          let borderLumSum = 0;
          let borderAlphaSum = 0;
          let borderSamples = 0;

          const step = Math.max(1, Math.floor(drawW / 20));
          for (let x = Math.floor(drawX); x < drawX + drawW; x += step) {
            // Top border sample
            const topIdx = (Math.floor(drawY) * targetWidth + x) * 4;
            // Bottom border sample
            const botIdx = (Math.floor(drawY + drawH - 1) * targetWidth + x) * 4;

            if (topIdx < data.length) {
              borderAlphaSum += data[topIdx + 3];
              borderLumSum += 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
              borderSamples++;
            }
            if (botIdx < data.length) {
              borderAlphaSum += data[botIdx + 3];
              borderLumSum += 0.299 * data[botIdx] + 0.587 * data[botIdx + 1] + 0.114 * data[botIdx + 2];
              borderSamples++;
            }
          }

          const avgBorderAlpha = borderSamples > 0 ? borderAlphaSum / borderSamples : 0;
          const avgBorderLum = borderSamples > 0 ? borderLumSum / borderSamples : 255;
          const isTransparentBg = avgBorderAlpha < 60;
          const isDarkBg = avgBorderLum < 90;

          let targetCount = 0;

          // 2. Classify each pixel inside the target bounds
          for (let y = Math.floor(drawY); y < drawY + drawH; y++) {
            for (let x = Math.floor(drawX); x < drawX + drawW; x++) {
              const pixelIdx = y * targetWidth + x;
              const idx = pixelIdx * 4;

              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const a = data[idx + 3];

              // If transparent outside drawing
              if (a < 35) {
                mask[pixelIdx] = 0;
                continue;
              }

              const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
              let isLine = false;

              if (isTransparentBg) {
                // Transparent PNG or SVG: visible opaque pixels are the lines!
                isLine = a >= 40 && luminance < 210;
              } else if (isDarkBg) {
                // Inverted image (e.g. white lines on black chalkboard):
                isLine = luminance > avgBorderLum + 40 && luminance > 90;
              } else {
                // Standard light/white paper background with dark lines:
                // Require significant contrast against background (avoid paper shadows/grey wash)
                isLine = luminance < avgBorderLum - 40 && luminance < 135;
              }

              if (isLine) {
                mask[pixelIdx] = 1;
                targetCount++;
              } else {
                mask[pixelIdx] = 0;
              }
            }
          }

          // Fallback if image was extremely low contrast or threshold was too tight
          if (targetCount < 100) {
            for (let y = Math.floor(drawY); y < drawY + drawH; y++) {
              for (let x = Math.floor(drawX); x < drawX + drawW; x++) {
                const pixelIdx = y * targetWidth + x;
                const idx = pixelIdx * 4;
                const a = data[idx + 3];
                if (a < 35) continue;
                const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (lum < 160) {
                  mask[pixelIdx] = 1;
                  targetCount++;
                }
              }
            }
          }

          // 3. Render clean transparent extracted guide lines for display
          const guideCanvas = document.createElement('canvas');
          guideCanvas.width = targetWidth;
          guideCanvas.height = targetHeight;
          const gCtx = guideCanvas.getContext('2d');
          if (gCtx) {
            const gData = gCtx.createImageData(targetWidth, targetHeight);
            for (let i = 0; i < totalPixels; i++) {
              if (mask[i] === 1) {
                const idx = i * 4;
                gData.data[idx] = 255;
                gData.data[idx + 1] = 255;
                gData.data[idx + 2] = 255;
                gData.data[idx + 3] = 240;
              }
            }
            gCtx.putImageData(gData, 0, 0);
          }

          resolve({
            width: targetWidth,
            height: targetHeight,
            totalTargetPixels: Math.max(1, targetCount),
            targetMask: mask,
            drawX,
            drawY,
            drawW,
            drawH,
            cleanGuideUrl: guideCanvas.toDataURL('image/png')
          });
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = (err) => {
        reject(new Error('Failed to load drawing image: ' + err));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Render guide mask directly to a canvas in the requested guide color and opacity with glow
   */
  public renderGuideToCanvas(
    canvas: HTMLCanvasElement,
    mask: Uint8Array,
    width: number,
    height: number,
    colorHex: string,
    opacity: number = 0.5
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Parse hex color to rgb
    const r = parseInt(colorHex.slice(1, 3), 16) || 250;
    const g = parseInt(colorHex.slice(3, 5), 16) || 204;
    const b = parseInt(colorHex.slice(5, 7), 16) || 21;
    const alphaVal = Math.min(255, Math.max(20, Math.round(opacity * 255)));

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const total = width * height;
    for (let i = 0; i < total; i++) {
      if (mask[i] === 1) {
        const idx = i * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = alphaVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Get radius based on tolerance level
   */
  public getToleranceRadius(tolerance: DrawingTolerance): number {
    switch (tolerance) {
      case 'easy':
        return 34;
      case 'normal':
        return 24;
      case 'strict':
        return 16;
      default:
        return 24;
    }
  }

  /**
   * Local storage management for Custom Drawings uploaded by Teacher / Admin
   */
  public getCustomDrawings(): DrawingItem[] {
    try {
      const stored = localStorage.getItem(CUSTOM_DRAWINGS_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  public saveCustomDrawing(item: DrawingItem): void {
    const list = this.getCustomDrawings();
    const existingIdx = list.findIndex(d => d.id === item.id);
    if (existingIdx > -1) {
      list[existingIdx] = item;
    } else {
      list.unshift(item);
    }
    localStorage.setItem(CUSTOM_DRAWINGS_KEY, JSON.stringify(list));
  }

  public updateCustomDrawing(item: DrawingItem): void {
    const list = this.getCustomDrawings();
    const idx = list.findIndex(d => d.id === item.id);
    if (idx > -1) {
      list[idx] = item;
      localStorage.setItem(CUSTOM_DRAWINGS_KEY, JSON.stringify(list));
    } else {
      this.saveCustomDrawing(item);
    }
  }

  public deleteCustomDrawing(id: string): void {
    const list = this.getCustomDrawings().filter(d => d.id !== id);
    localStorage.setItem(CUSTOM_DRAWINGS_KEY, JSON.stringify(list));
  }

  /**
   * Preset Drawings Management (User Question: كيف أعدل أو أحذف الدروس الافتراضية؟)
   */
  public getPresetOverrides(): Record<string, DrawingItem> {
    try {
      const stored = localStorage.getItem('baseera_preset_overrides');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  public savePresetOverride(item: DrawingItem): void {
    const overrides = this.getPresetOverrides();
    overrides[item.id] = { ...item, isCustom: false };
    localStorage.setItem('baseera_preset_overrides', JSON.stringify(overrides));
  }

  public resetPresetToDefault(id: string): void {
    const overrides = this.getPresetOverrides();
    delete overrides[id];
    localStorage.setItem('baseera_preset_overrides', JSON.stringify(overrides));
  }

  public getHiddenPresetIds(): string[] {
    try {
      const stored = localStorage.getItem('baseera_hidden_presets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public hidePresetDrawing(id: string): void {
    const hidden = this.getHiddenPresetIds();
    if (!hidden.includes(id)) {
      hidden.push(id);
      localStorage.setItem('baseera_hidden_presets', JSON.stringify(hidden));
    }
  }

  public restorePresetDrawing(id: string): void {
    const hidden = this.getHiddenPresetIds().filter(hId => hId !== id);
    localStorage.setItem('baseera_hidden_presets', JSON.stringify(hidden));
  }

  public restoreAllPresetDrawings(): void {
    localStorage.removeItem('baseera_hidden_presets');
  }

  /**
   * Unified Get All Drawings: Custom + Modified Presets - Hidden Presets
   */
  public getAllDrawings(): DrawingItem[] {
    const custom = this.getCustomDrawings();
    const overrides = this.getPresetOverrides();
    const hiddenIds = new Set(this.getHiddenPresetIds());

    const activePresets = PRESET_DRAWINGS
      .filter(p => !hiddenIds.has(p.id))
      .map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);

    return [...custom, ...activePresets];
  }

  /**
   * Unified update: handles both custom and preset items
   */
  public updateAnyDrawing(item: DrawingItem): void {
    const isPreset = PRESET_DRAWINGS.some(p => p.id === item.id);
    if (isPreset) {
      this.savePresetOverride(item);
    } else {
      this.updateCustomDrawing(item);
    }
  }

  /**
   * Unified delete: removes custom or hides preset
   */
  public deleteAnyDrawing(id: string): void {
    const isPreset = PRESET_DRAWINGS.some(p => p.id === id);
    if (isPreset) {
      this.hidePresetDrawing(id);
    } else {
      this.deleteCustomDrawing(id);
    }
  }

  /**
   * Find drawing by ID across custom or presets
   */
  public getDrawingById(id: string): DrawingItem | undefined {
    return this.getAllDrawings().find(d => d.id === id);
  }

  /**
   * ==============================================================
   * MULTI-DEVICE SHARING, EXPORT/IMPORT & GITHUB VERCEL INTEGRATION
   * ==============================================================
   */

  /**
   * UTF-8 safe Base64 encoder for Arabic text & SVG markup
   */
  public encodeLessonToSharePayload(item: DrawingItem): string {
    const minified: Partial<DrawingItem> = {
      id: item.id,
      title: item.title,
      titleEn: item.titleEn,
      category: item.category,
      description: item.description,
      imageUrl: item.imageUrl,
      mode: item.mode,
      opacity: item.opacity,
      tolerance: item.tolerance,
      targetAccuracy: item.targetAccuracy,
      points: item.points,
      arabicAudioText: item.arabicAudioText,
      guideColor: item.guideColor,
      steps: item.steps,
      enableStepsGuide: item.enableStepsGuide,
      isCustom: true
    };
    const jsonStr = JSON.stringify(minified);
    return window.btoa(
      encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }

  /**
   * UTF-8 safe Base64 decoder
   */
  public decodeLessonFromSharePayload(raw: string): DrawingItem | null {
    try {
      const cleaned = raw.trim();
      const jsonStr = decodeURIComponent(
        Array.prototype.map
          .call(window.atob(cleaned), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.title === 'string' && (parsed.imageUrl || parsed.steps)) {
        return {
          id: parsed.id || 'shared_draw_' + Date.now(),
          title: parsed.title,
          titleEn: parsed.titleEn || parsed.title,
          category: parsed.category || 'letters',
          description: parsed.description,
          imageUrl: parsed.imageUrl,
          mode: parsed.mode || 'trace',
          opacity: parsed.opacity ?? 0.25,
          tolerance: parsed.tolerance || 'normal',
          targetAccuracy: parsed.targetAccuracy || 70,
          points: parsed.points || 100,
          arabicAudioText: parsed.arabicAudioText || parsed.title,
          guideColor: parsed.guideColor || 'yellow',
          isCustom: true,
          steps: Array.isArray(parsed.steps) ? parsed.steps : undefined,
          enableStepsGuide: parsed.enableStepsGuide ?? (Array.isArray(parsed.steps) && parsed.steps.length > 0)
        };
      }
      return null;
    } catch (e) {
      console.error('Failed to decode shared lesson:', e);
      return null;
    }
  }

  /**
   * Build full URL for sharing a lesson to any mobile, tablet, or PC
   */
  public getShareUrlForLesson(item: DrawingItem): string {
    const payload = this.encodeLessonToSharePayload(item);
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    return `${origin}${pathname}#lesson=${payload}`;
  }

  /**
   * Export all custom lessons and overrides as downloadable JSON
   */
  public exportAllDrawingsJson(): string {
    const custom = this.getCustomDrawings();
    const overrides = this.getPresetOverrides();
    const backup = {
      app: 'BaseeraInteractiveDrawingStudio',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      customDrawings: custom,
      presetOverrides: overrides
    };
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Import lessons from JSON string (from file or paste)
   */
  public importDrawingsFromJson(jsonString: string): { importedCount: number; errors: string[] } {
    const errors: string[] = [];
    let count = 0;
    try {
      const data = JSON.parse(jsonString);
      // Support both full backup object or direct array
      const items: DrawingItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data.customDrawings)
        ? data.customDrawings
        : [];

      if (items.length === 0) {
        errors.push('لم يتم العثور على أي دروس صالحة في الملف.');
        return { importedCount: 0, errors };
      }

      for (const item of items) {
        if (item && item.title && item.imageUrl) {
          const validItem: DrawingItem = {
            ...item,
            id: item.id || 'imported_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            isCustom: true
          };
          this.saveCustomDrawing(validItem);
          count++;
        }
      }

      // Also import preset overrides if available
      if (data.presetOverrides && typeof data.presetOverrides === 'object') {
        const currentOverrides = this.getPresetOverrides();
        Object.assign(currentOverrides, data.presetOverrides);
        localStorage.setItem('baseera_preset_overrides', JSON.stringify(currentOverrides));
      }

      return { importedCount: count, errors };
    } catch (err: any) {
      errors.push('صيغة الملف غير صالحة: ' + (err.message || 'خطأ في قراءة JSON'));
      return { importedCount: 0, errors };
    }
  }

  /**
   * Generate permanent TypeScript code to paste directly into src/data/drawingData.ts
   * So when pushed to GitHub, Vercel permanently serves these lessons on all devices worldwide!
   */
  public generateTypeScriptCodeForGitHub(): string {
    const custom = this.getCustomDrawings();
    if (custom.length === 0) return '// لا توجد دروس مخصصة حالياً.';

    const formatted = custom.map(item => {
      return `  {
    id: ${JSON.stringify(item.id)},
    title: ${JSON.stringify(item.title)},
    titleEn: ${JSON.stringify(item.titleEn || item.title)},
    category: ${JSON.stringify(item.category)},
    description: ${JSON.stringify(item.description || '')},
    imageUrl: ${JSON.stringify(item.imageUrl)},
    mode: ${JSON.stringify(item.mode)},
    opacity: ${item.opacity || 0.25},
    tolerance: ${JSON.stringify(item.tolerance || 'normal')},
    targetAccuracy: ${item.targetAccuracy || 70},
    points: ${item.points || 100},
    arabicAudioText: ${JSON.stringify(item.arabicAudioText || item.title)},
    guideColor: ${JSON.stringify(item.guideColor || 'yellow')},
    enableStepsGuide: ${item.enableStepsGuide ? 'true' : 'false'},
    steps: ${item.steps ? JSON.stringify(item.steps, null, 6) : 'undefined'}
  }`;
    }).join(',\n');

    return `// انسخ هذا الكود وألصقه داخل مصفوفة DEFAULT_DRAWINGS في ملف src/data/drawingData.ts
// ثم ارفع التغييرات إلى مستودع GitHub (git add . && git commit -m "Add new lessons" && git push)
// وسيقوم موقع Vercel ببنائها فوراً لتصبح دروساً رسمية لجميع الطلاب والأجهزة تلقائياً:

${formatted}`;
  }
}

export const drawingEngineService = new DrawingEngineService();
