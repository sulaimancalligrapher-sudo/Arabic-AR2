import { DrawingItem } from '../types';

/**
 * Helper to encode SVG string to Data URL
 */
const svgToDataUrl = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;
};

// 1. Letters SVGs
const SVG_ALIF = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
  <!-- Hamza -->
  <path d="M 205 95 C 190 85, 175 95, 175 110 C 175 125, 195 130, 215 130 C 230 130, 235 140, 210 148 L 170 152" fill="none" stroke="#0f172a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Alif Body -->
  <path d="M 200 180 L 200 420" fill="none" stroke="#0f172a" stroke-width="26" stroke-linecap="round"/>
</svg>
`);

const SVG_BAA = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
  <!-- Baa Body -->
  <path d="M 380 200 C 380 250, 360 270, 310 270 L 190 270 C 140 270, 120 250, 120 200" fill="none" stroke="#0f172a" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Baa Dot -->
  <circle cx="250" cy="330" r="16" fill="#0f172a" />
</svg>
`);

const SVG_JEEM = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- Head of Jeem -->
  <path d="M 170 150 L 330 150 C 310 170, 260 210, 210 240" fill="none" stroke="#0f172a" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Belly of Jeem -->
  <path d="M 210 240 C 360 270, 360 420, 220 420 C 150 420, 120 370, 130 330" fill="none" stroke="#0f172a" stroke-width="24" stroke-linecap="round"/>
  <!-- Dot inside belly -->
  <circle cx="230" cy="330" r="16" fill="#0f172a" />
</svg>
`);

const SVG_DAL = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
  <!-- Dal curve -->
  <path d="M 280 130 C 270 200, 230 270, 150 290 L 310 290" fill="none" stroke="#0f172a" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`);

const SVG_RAA = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
  <!-- Raa stroke -->
  <path d="M 270 140 C 265 190, 250 250, 190 320 C 160 355, 120 370, 90 375" fill="none" stroke="#0f172a" stroke-width="26" stroke-linecap="round"/>
</svg>
`);

const SVG_SEEN = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
  <!-- Three teeth of Seen -->
  <path d="M 390 190 C 390 220, 360 230, 340 230 C 340 190, 305 190, 305 230 C 305 190, 270 190, 270 230" fill="none" stroke="#0f172a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Basin of Seen -->
  <path d="M 270 230 C 270 320, 190 350, 140 330 C 100 310, 95 260, 95 220" fill="none" stroke="#0f172a" stroke-width="22" stroke-linecap="round"/>
</svg>
`);

// 2. Shapes & Objects SVGs
const SVG_HILAL = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- Crescent Moon -->
  <path d="M 280 80 C 160 110, 100 220, 140 340 C 175 440, 290 470, 370 410 C 270 390, 200 320, 210 210 C 215 150, 245 105, 280 80 Z" fill="none" stroke="#0f172a" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
`);

const SVG_NAJMA = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- 5-Point Star -->
  <polygon points="250,50 315,185 460,195 350,290 385,435 250,355 115,435 150,290 40,195 185,185" fill="none" stroke="#0f172a" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
`);

const SVG_SHAMS = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- Sun Center -->
  <circle cx="250" cy="250" r="90" fill="none" stroke="#0f172a" stroke-width="22"/>
  <!-- Sun Rays -->
  <line x1="250" y1="90" x2="250" y2="40" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="250" y1="410" x2="250" y2="460" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="90" y1="250" x2="40" y2="250" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="410" y1="250" x2="460" y2="250" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="135" y1="135" x2="100" y2="100" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="365" y1="365" x2="400" y2="400" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="365" y1="135" x2="400" y2="100" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
  <line x1="135" y1="365" x2="100" y2="400" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>
</svg>
`);

const SVG_TUFFAHA = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- Apple Stem & Leaf -->
  <path d="M 250 120 C 255 70, 280 50, 295 40" fill="none" stroke="#0f172a" stroke-width="16" stroke-linecap="round"/>
  <path d="M 265 80 C 310 70, 330 90, 340 100 C 330 120, 290 120, 265 80 Z" fill="none" stroke="#0f172a" stroke-width="14" stroke-linejoin="round"/>
  <!-- Apple Body -->
  <path d="M 250 140 C 210 100, 110 110, 100 210 C 90 320, 180 430, 250 430 C 320 430, 410 320, 400 210 C 390 110, 290 100, 250 140 Z" fill="none" stroke="#0f172a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`);

const SVG_KITAB = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
  <!-- Open Book -->
  <path d="M 250 150 C 290 120, 370 120, 430 140 L 430 330 C 370 310, 290 310, 250 340 L 250 150 Z" fill="none" stroke="#0f172a" stroke-width="20" stroke-linejoin="round"/>
  <path d="M 250 150 C 210 120, 130 120, 70 140 L 70 330 C 130 310, 210 310, 250 340 L 250 150 Z" fill="none" stroke="#0f172a" stroke-width="20" stroke-linejoin="round"/>
</svg>
`);

const SVG_QAARIB = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <!-- Sailboat Mast & Sail -->
  <line x1="230" y1="80" x2="230" y2="340" stroke="#0f172a" stroke-width="18" stroke-linecap="round"/>
  <polygon points="245,100 370,310 245,310" fill="none" stroke="#0f172a" stroke-width="20" stroke-linejoin="round"/>
  <polygon points="215,140 120,310 215,310" fill="none" stroke="#0f172a" stroke-width="18" stroke-linejoin="round"/>
  <!-- Boat Hull -->
  <path d="M 90 350 L 410 350 L 360 420 L 150 420 Z" fill="none" stroke="#0f172a" stroke-width="20" stroke-linejoin="round"/>
  <!-- Water Waves -->
  <path d="M 70 440 C 110 460, 150 430, 190 450 C 230 470, 270 440, 310 460 C 350 480, 390 450, 430 460" fill="none" stroke="#0f172a" stroke-width="14" stroke-linecap="round"/>
</svg>
`);

export const PRESET_DRAWINGS: DrawingItem[] = [
  // LETTERS
  {
    id: 'draw_alif',
    title: 'حرف الألف (أ)',
    titleEn: 'Letter Alif',
    category: 'letters',
    description: 'تتبع رسم حرف الألف وهمزته من الأعلى إلى الأسفل',
    imageUrl: SVG_ALIF,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 75,
    points: 100,
    arabicAudioText: 'أَلِف'
  },
  {
    id: 'draw_baa',
    title: 'حرف الباء (ب)',
    titleEn: 'Letter Baa',
    category: 'letters',
    description: 'تتبع صحن حرف الباء من اليمين لليسار ثم ضع النقطة بالأسفل',
    imageUrl: SVG_BAA,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 75,
    points: 100,
    arabicAudioText: 'بَاء'
  },
  {
    id: 'draw_jeem',
    title: 'حرف الجيم (ج)',
    titleEn: 'Letter Jeem',
    category: 'letters',
    description: 'تتبع رأس حرف الجيم وبطنه المنحني والنقطة في وسطه',
    imageUrl: SVG_JEEM,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 70,
    points: 120,
    arabicAudioText: 'جِيم'
  },
  {
    id: 'draw_dal',
    title: 'حرف الدال (د)',
    titleEn: 'Letter Dal',
    category: 'letters',
    description: 'تتبع انحناء حرف الدال وسيره الأفقي',
    imageUrl: SVG_DAL,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 80,
    points: 90,
    arabicAudioText: 'دَال'
  },
  {
    id: 'draw_raa',
    title: 'حرف الراء (ر)',
    titleEn: 'Letter Raa',
    category: 'letters',
    description: 'تتبع انزلاق حرف الراء مثل هلال مقلوب',
    imageUrl: SVG_RAA,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 75,
    points: 100,
    arabicAudioText: 'رَاء'
  },
  {
    id: 'draw_seen',
    title: 'حرف السين (س)',
    titleEn: 'Letter Seen',
    category: 'letters',
    description: 'تتبع أسنان حرف السين الثلاثة ثم صحنه الواسع',
    imageUrl: SVG_SEEN,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'easy',
    targetAccuracy: 70,
    points: 130,
    arabicAudioText: 'سِين'
  },

  // SHAPES & OBJECTS
  {
    id: 'draw_hilal',
    title: 'هلال وقمر (🌙)',
    titleEn: 'Crescent Moon',
    category: 'shapes',
    description: 'تتبع انحناء هلال القمر المبارك مع الالتزام بالخط',
    imageUrl: SVG_HILAL,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 75,
    points: 110,
    arabicAudioText: 'هِلَال'
  },
  {
    id: 'draw_najma',
    title: 'نجمة ساطعة (⭐)',
    titleEn: 'Five-Point Star',
    category: 'shapes',
    description: 'تتبع أضلاع النجمة الخماسية بزواياها المتقاطعة',
    imageUrl: SVG_NAJMA,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'easy',
    targetAccuracy: 70,
    points: 120,
    arabicAudioText: 'نَجْمَة'
  },
  {
    id: 'draw_shams',
    title: 'شمس مشرقة (☀️)',
    titleEn: 'Shining Sun',
    category: 'shapes',
    description: 'تتبع دائرة الشمس وأشعتها الذهبية',
    imageUrl: SVG_SHAMS,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'easy',
    targetAccuracy: 70,
    points: 120,
    arabicAudioText: 'شَمْس'
  },
  {
    id: 'draw_tuffaha',
    title: 'تفاحة حمراء (🍎)',
    titleEn: 'Red Apple (Coloring)',
    category: 'shapes',
    description: 'لوّن التفاحة بحركة اليد باللون الأحمر اللامع!',
    imageUrl: SVG_TUFFAHA,
    mode: 'color',
    opacity: 0.35,
    tolerance: 'easy',
    targetAccuracy: 65,
    points: 120,
    arabicAudioText: 'تُفَّاحَة'
  },
  {
    id: 'draw_kitab',
    title: 'كتاب مفتوح (📖)',
    titleEn: 'Open Book',
    category: 'shapes',
    description: 'تتبع صفحات الكتاب المفتوح من اليمين إلى اليسار',
    imageUrl: SVG_KITAB,
    mode: 'trace',
    opacity: 0.25,
    tolerance: 'normal',
    targetAccuracy: 75,
    points: 110,
    arabicAudioText: 'كِتَاب'
  },
  {
    id: 'draw_qaarib',
    title: 'قارب في البحر (⛵)',
    titleEn: 'Sailboat (Coloring)',
    category: 'shapes',
    description: 'لوّن شراع القارب وأمواج البحر بالفرشاة الهوائية',
    imageUrl: SVG_QAARIB,
    mode: 'color',
    opacity: 0.35,
    tolerance: 'easy',
    targetAccuracy: 60,
    points: 130,
    arabicAudioText: 'قَارِب'
  }
];
