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

  public getAllDrawings(): DrawingItem[] {
    const custom = this.getCustomDrawings();
    return [...custom, ...PRESET_DRAWINGS];
  }
}

export const drawingEngineService = new DrawingEngineService();
