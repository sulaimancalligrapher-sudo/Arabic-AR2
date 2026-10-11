import React, { useState, useRef, useEffect } from 'react';
import { DrawingItem, DrawingMode, DrawingTolerance } from '../../types';
import { drawingEngineService, GUIDE_LINE_COLORS } from '../../services/drawingEngineService';
import { whiteboardSyncService } from '../../services/whiteboardSyncService';
import {
  X,
  Upload,
  Settings,
  Image as ImageIcon,
  Check,
  Trash2,
  Edit2,
  Sparkles,
  Sliders,
  Volume2,
  Info,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Hand,
  PenTool,
  Eye,
  EyeOff
} from 'lucide-react';

interface DrawingAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDrawingsUpdated: () => void;
  initialEditingDrawingId?: string | null;
}

export const DrawingAdminModal: React.FC<DrawingAdminModalProps> = ({
  isOpen,
  onClose,
  onDrawingsUpdated,
  initialEditingDrawingId
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'manage' | 'student_controls'>('upload');
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Student Whiteboard Controls State (Request 3)
  const [showStudentInputToggle, setShowStudentInputToggle] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baseera_student_input_toggle_visible') === 'true';
    }
    return false;
  });
  const [studentInputMethod, setStudentInputMethod] = useState<'hand' | 'touch_mouse'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('baseera_student_input_method') as any) || 'hand';
    }
    return 'hand';
  });
  
  // Form fields for new or editing drawing
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [category, setCategory] = useState<'letters' | 'shapes' | 'custom'>('custom');
  const [mode, setMode] = useState<DrawingMode>('trace');
  const [opacity, setOpacity] = useState<number>(0.35);
  const [tolerance, setTolerance] = useState<DrawingTolerance>('normal');
  const [targetAccuracy, setTargetAccuracy] = useState<number>(75);
  const [points, setPoints] = useState<number>(100);
  const [arabicAudioText, setArabicAudioText] = useState('');
  const [guideColor, setGuideColor] = useState<'yellow' | 'green' | 'white' | 'cyan' | 'black'>('yellow');
  
  // Image preview
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Existing custom drawings
  const [customList, setCustomList] = useState<DrawingItem[]>(
    drawingEngineService.getCustomDrawings()
  );

  const resetForm = () => {
    setTitle('');
    setTitleEn('');
    setCategory('custom');
    setMode('trace');
    setOpacity(0.35);
    setTolerance('normal');
    setTargetAccuracy(75);
    setPoints(100);
    setArabicAudioText('');
    setGuideColor('yellow');
    setImageUrl(null);
    setImageError(null);
    setEditingDrawingId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError('حجم الصورة كبير جداً، يرجى اختيار صورة أصغر من 5 ميغابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageUrl(dataUrl);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartEdit = (item: DrawingItem) => {
    setEditingDrawingId(item.id);
    setTitle(item.title);
    setTitleEn(item.titleEn);
    setCategory(item.category);
    setMode(item.mode);
    setOpacity(item.opacity);
    setTolerance(item.tolerance);
    setTargetAccuracy(item.targetAccuracy);
    setPoints(item.points);
    setArabicAudioText(item.arabicAudioText || '');
    setGuideColor(item.guideColor || 'yellow');
    setImageUrl(item.imageUrl);
    setImageError(null);
    setActiveTab('upload');
  };

  useEffect(() => {
    if (isOpen && initialEditingDrawingId) {
      const allCustom = drawingEngineService.getCustomDrawings();
      const target = allCustom.find(d => d.id === initialEditingDrawingId);
      if (target) {
        handleStartEdit(target);
      }
    }
  }, [isOpen, initialEditingDrawingId]);

  const handleCancelEdit = () => {
    resetForm();
    setActiveTab('manage');
  };

  const handleSaveDrawing = () => {
    if (!imageUrl) {
      setImageError('يرجى رفع صورة للرسمة أولاً.');
      return;
    }
    if (!title.trim()) {
      setImageError('يرجى كتابة عنوان أو اسم للرسمة.');
      return;
    }

    if (editingDrawingId) {
      // Update existing drawing
      const updatedItem: DrawingItem = {
        id: editingDrawingId,
        title: title.trim(),
        titleEn: titleEn.trim() || title.trim(),
        category,
        imageUrl,
        mode,
        opacity,
        tolerance,
        targetAccuracy,
        points,
        arabicAudioText: arabicAudioText.trim() || title.trim(),
        guideColor,
        isCustom: true,
        createdAt: new Date().toLocaleDateString('ar-SA')
      };

      drawingEngineService.updateCustomDrawing(updatedItem);
    } else {
      // Create new drawing
      const newItem: DrawingItem = {
        id: 'custom_draw_' + Date.now(),
        title: title.trim(),
        titleEn: titleEn.trim() || title.trim(),
        category,
        imageUrl,
        mode,
        opacity,
        tolerance,
        targetAccuracy,
        points,
        arabicAudioText: arabicAudioText.trim() || title.trim(),
        guideColor,
        isCustom: true,
        createdAt: new Date().toLocaleDateString('ar-SA')
      };

      drawingEngineService.saveCustomDrawing(newItem);
    }

    setCustomList(drawingEngineService.getCustomDrawings());
    onDrawingsUpdated();
    resetForm();
    setActiveTab('manage');
  };

  const handleDelete = (id: string) => {
    drawingEngineService.deleteCustomDrawing(id);
    setCustomList(drawingEngineService.getCustomDrawings());
    if (editingDrawingId === id) {
      resetForm();
    }
    onDrawingsUpdated();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-serif">
                إعدادات الإدارة واستوديو الرسم
              </h3>
              <p className="text-xs text-slate-400">
                {editingDrawingId ? 'تعديل بيانات وإعدادات الرسمة المحددة' : 'ارفع رسومات جديدة، وتحكّم بطريقة عرضها، ولون الخط، وشروط التقييم'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 flex gap-4 border-b border-slate-800">
          <button
            onClick={() => {
              setActiveTab('upload');
            }}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'upload'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {editingDrawingId ? <Edit2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{editingDrawingId ? 'تعديل إعدادات الرسمة ✏️' : 'رفع رسمة جديدة'}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('manage');
            }}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'manage'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>إدارة وتعديل الرسومات المرفوعة ({customList.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('student_controls');
            }}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'student_controls'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>تحكم سبورة الطالب وإظهار الزر 👁️</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'upload' ? (
            <div className="space-y-4 text-xs">
              
              {/* Image Design Guidelines Banner (Answers User Question!) */}
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-slate-300">
                <button
                  type="button"
                  onClick={() => setShowGuidelines(!showGuidelines)}
                  className="w-full flex items-center justify-between font-bold text-amber-400 text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>قواعد ومعايير الصور للرسم المنضبط والدقيق (مهم جداً)</span>
                  </span>
                  {showGuidelines ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showGuidelines && (
                  <ul className="mt-2.5 space-y-1.5 text-[11px] text-slate-300 list-disc list-inside leading-relaxed border-t border-amber-500/20 pt-2">
                    <li><strong className="text-white">خلفية بيضاء نقية أو شفافة:</strong> الصور بتنسيق PNG شفاف أو SVG تعطي دقة 100%. تجنب الصور الفوتوغرافية التي تحوي ظلالاً رمادية على الورق.</li>
                    <li><strong className="text-white">خطوط سوداء أو داكنة محددة:</strong> يجب أن تكون الخطوط واضحة دون غباش أو تدرجات خفيفة ليتمكن النظام من استخراج المسار.</li>
                    <li><strong className="text-white">سمك الخط الموصى به:</strong> خط واضح ومستمر (بين 5 و 16 بكسل). الخطوط الرفيعة جداً كالشعر تصعب إصابتها بالكاميرا.</li>
                    <li><strong className="text-white">لون خط الإرشاد:</strong> إذا كانت إضاءة الغرفة مظلمة، اختر <strong>«أصفر نيون»</strong> أو <strong>«أخضر فاتح»</strong> ليتوهج الخط بوضوح تام فوق الفيديو!</li>
                  </ul>
                )}
              </div>

              {/* Editing alert indicator */}
              {editingDrawingId && (
                <div className="p-2.5 rounded-xl bg-sky-950/50 border border-sky-500/40 text-sky-200 text-xs flex items-center justify-between">
                  <span>أنت الآن في وضع <strong>تعديل إعدادات الرسمة</strong>: {title}</span>
                  <button
                    onClick={handleCancelEdit}
                    className="text-xs text-sky-300 underline font-semibold hover:text-white cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                </div>
              )}

              {/* Upload Drop Area */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  ملف صورة الرسمة (PNG, SVG, JPG):
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-700 hover:border-amber-400/70 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-slate-800/40"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {imageUrl ? (
                    <div className="relative group">
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="max-h-36 max-w-full rounded-xl object-contain bg-white p-2 border border-slate-600 shadow"
                      />
                      <span className="block text-center text-[10px] text-amber-400 mt-1 font-semibold">
                        اضغط لاستبدال الصورة
                      </span>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-slate-500" />
                      <span className="text-slate-300 font-bold">اضغط هنا لرفع صورة من جهازك</span>
                      <span className="text-slate-500 text-[10px]">
                        خطوط واضحة على خلفية بيضاء أو شفافة (PNG أو SVG موصى بهما)
                      </span>
                    </>
                  )}
                </div>
                {imageError && (
                  <p className="text-rose-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{imageError}</span>
                  </p>
                )}
              </div>

              {/* Titles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">اسم الرسمة (عربي):</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: حرف الميم، أو شجرة، أو سيارة"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">الاسم بالإنجليزي (اختياري):</label>
                  <input
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="e.g. Letter Meem / Tree"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Guide Line Color Option (User Request Point 3!) */}
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
                <label className="block text-amber-300 font-bold">
                  لون خط الإرشاد الافتراضي (لحل مشكلة الكاميرات المظلمة):
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {GUIDE_LINE_COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setGuideColor(c.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        guideColor === c.id
                          ? 'border-white bg-slate-700 text-white ring-2 ring-amber-400 shadow-md scale-105'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-white/50" style={{ backgroundColor: c.hex }} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  💡 «الأصفر النيون» أو «الأخضر الفاتح» يتوهج فوق أي خلفية تصوير حتى لو كانت الكاميرا مظلمة!
                </p>
              </div>

              {/* Mode & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">نوع النشاط:</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as DrawingMode)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="trace">تتبع الخط (Trace Lines) - تدريب الحروف والأشكال</option>
                    <option value="color">تلوين (Coloring) - تعبئة المساحات بالفرشاة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">التصنيف:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="letters">حروف عربية (Letters)</option>
                    <option value="shapes">أشكال ورموز (Shapes)</option>
                    <option value="custom">رسومات حرة / أخرى (Custom)</option>
                  </select>
                </div>
              </div>

              {/* Audio Pronunciation Text */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>النص الصوتي العربي لنطق اسم الرسمة عند فتحها:</span>
                </label>
                <input
                  type="text"
                  value={arabicAudioText}
                  onChange={(e) => setArabicAudioText(e.target.value)}
                  placeholder="مثال: هيا نرسم حرف الميم بصوت واضح"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Tolerance, Accuracy, Opacity, Points */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                
                {/* Tolerance */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">هامش التسامح الحركي:</label>
                  <select
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value as DrawingTolerance)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="easy">سهل (هامش واسع للمبتدئين والأطفال)</option>
                    <option value="normal">متوسط (المعيار الموصى به)</option>
                    <option value="strict">دقيق (للمتقدمين والخطاطين)</option>
                  </select>
                </div>

                {/* Target Accuracy % */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    نسبة الإتقان المطلوبة للنجاح: {targetAccuracy}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="90"
                    step="5"
                    value={targetAccuracy}
                    onChange={(e) => setTargetAccuracy(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer mt-2"
                  />
                </div>

                {/* Opacity */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    شفافية خط الرسمة كدليل: {Math.round(opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.15"
                    max="0.80"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer mt-2"
                  />
                </div>

                {/* Points */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">النقاط المكتسبة:</label>
                  <input
                    type="number"
                    min="50"
                    max="500"
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                {editingDrawingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-colors cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveDrawing}
                  className="flex-2 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingDrawingId ? 'حفظ تعديلات الرسمة وإتاحتها فوراً' : 'حفظ الرسمة وإضافتها للاستوديو فوراً'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {customList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                  <p>لم يتم رفع أي رسمة مخصصة حتى الآن.</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                  >
                    رفع أول رسمة الآن ←
                  </button>
                </div>
              ) : (
                customList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-3 shadow-md hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-14 h-14 rounded-xl object-contain bg-white p-1 border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white font-serif truncate">{item.title}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            {item.mode === 'color' ? 'تلوين' : 'تتبع خط'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          دقة مطلوبة {item.targetAccuracy}% · {item.points} نقطة · خط إرشادي: {GUIDE_LINE_COLORS.find(c => c.id === (item.guideColor || 'yellow'))?.name || 'أصفر'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Edit Button (User Request Point 4!) */}
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="p-2 rounded-xl bg-slate-700 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-600 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="تعديل إعدادات هذه الرسمة"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">تعديل</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 transition-colors cursor-pointer"
                        title="حذف الرسمة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Student Controls & Visibility (Request 3) */}
          {activeTab === 'student_controls' && (
            <div className="space-y-5 text-xs">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>التحكم في زر طريقة الرسم عند الطلاب (حركة اليد / لمس أو فأرة)</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  بشكل افتراضي، يكون زر التبديل <strong>مخفياً</strong> من شاشة الطالب لمنع تشتيت انتباهه. يمكنك النقر على أيقونة <strong>«العين»</strong> لإظهار الزر للطالب في شاشته، أو إخفائه في أي وقت.
                </p>
              </div>

              {/* Eye Toggle & Current Visibility */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs font-bold text-white mb-0.5">
                      حالة ظهور الزر في شاشة الطالب:
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {showStudentInputToggle
                        ? '🟢 الزر ظاهر حالياً في شاشة الطالب ويمكنه التبديل بنفسه.'
                        : '🔒 الزر مخفي حالياً من شاشة الطالب (الوضع الافتراضي المستحسن).'}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const next = !showStudentInputToggle;
                      setShowStudentInputToggle(next);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('baseera_student_input_toggle_visible', String(next));
                      }
                      whiteboardSyncService.sendStudentInputToggleVisibility(next, 'all');
                    }}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                      showStudentInputToggle
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {showStudentInputToggle ? (
                      <>
                        <Eye className="w-4 h-4" />
                        <span>ظاهر في صفحة الطالب (انقر للإخفاء) 👁️</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4 text-slate-400" />
                        <span>مخفي من صفحة الطالب (انقر للإظهار) 👁️‍🗨️</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Input Mode Force Selection */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-white mb-1">
                  تحديد طريقة الرسم الإلزامية لجميع الطلاب:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setStudentInputMethod('hand');
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('baseera_student_input_method', 'hand');
                      }
                      whiteboardSyncService.sendInputMethod('hand', 'all');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      studentInputMethod === 'hand'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-lg ring-2 ring-sky-400/30 font-black'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Hand className="w-4 h-4" />
                    <span>تتبع حركة اليد أمام الكاميرا ✋</span>
                  </button>

                  <button
                    onClick={() => {
                      setStudentInputMethod('touch_mouse');
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('baseera_student_input_method', 'touch_mouse');
                      }
                      whiteboardSyncService.sendInputMethod('touch_mouse', 'all');
                    }}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      studentInputMethod === 'touch_mouse'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg ring-2 ring-amber-400/30 font-black'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <PenTool className="w-4 h-4" />
                    <span>السبورة البيضاء (لمس / ماوس) 🖌️</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  عند تحديد أي من الوضعين، يتم تحويل جميع شاشات الطلاب فوراً إلى الوضع المختار.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 text-xs text-slate-400 flex items-center justify-between">
          <span>الرسومات المحفوظة والمعدلة متاحة فوراً لجميع الطلاب في استوديو الرسم</span>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
