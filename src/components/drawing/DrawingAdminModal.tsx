import React, { useState, useRef, useEffect } from 'react';
import { DrawingItem, DrawingMode, DrawingTolerance, DrawingStep } from '../../types';
import { drawingEngineService, GUIDE_LINE_COLORS } from '../../services/drawingEngineService';
import { PRESET_DRAWINGS } from '../../data/drawingData';
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
  EyeOff,
  Plus,
  Target,
  ArrowRight,
  RotateCcw,
  Compass,
  Copy,
  Download,
  Globe,
  CheckCheck,
  Code
} from 'lucide-react';
import arDrawingCanvasRaw from './ARDrawingCanvas?raw';
import studentWhiteboardViewRaw from './StudentWhiteboardView?raw';

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
  const [activeTab, setActiveTab] = useState<'upload' | 'step_maker' | 'manage' | 'multi_device' | 'student_controls'>('upload');
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Permanent GitHub & Vercel Code States
  const [githubCodeCopied, setGithubCodeCopied] = useState(false);
  const [fileDownloaded, setFileDownloaded] = useState(false);
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [copyFeedbackMsg, setCopyFeedbackMsg] = useState<string | null>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  
  // Step Maker State (نظام خطوات رسم الحروف وترقيمها)
  const [steps, setSteps] = useState<DrawingStep[]>([]);
  const [enableStepsGuide, setEnableStepsGuide] = useState<boolean>(true);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [stepMakerMode, setStepMakerMode] = useState<'start' | 'end'>('start');
  const [stepBgType, setStepBgType] = useState<'white' | 'grid' | 'dark'>('white');
  const [invertImage, setInvertImage] = useState<boolean>(false);
  const stepImageContainerRef = useRef<HTMLDivElement | null>(null);

  // Image preview
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Drawings list (both custom and preset)
  const [customList, setCustomList] = useState<DrawingItem[]>(() =>
    drawingEngineService.getCustomDrawings()
  );
  const [allDrawingsList, setAllDrawingsList] = useState<DrawingItem[]>(() =>
    drawingEngineService.getAllDrawings()
  );
  const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>(() =>
    drawingEngineService.getHiddenPresetIds()
  );
  const [manageFilter, setManageFilter] = useState<'all' | 'custom' | 'presets'>('all');

  const refreshDrawingsList = () => {
    setCustomList(drawingEngineService.getCustomDrawings());
    setAllDrawingsList(drawingEngineService.getAllDrawings());
    setHiddenPresetIds(drawingEngineService.getHiddenPresetIds());
  };

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
    setSteps([]);
    setEnableStepsGuide(true);
    setActiveStepIndex(0);
    setStepMakerMode('start');
    setStepBgType('white');
    setInvertImage(false);
  };

  const handleAddStep = () => {
    const nextNum = steps.length + 1;
    const newStep: DrawingStep = {
      id: 'step_' + Date.now(),
      stepNumber: nextNum,
      label: `الخطوة ${nextNum}`,
      startPoint: { x: 0.5, y: 0.2 },
      endPoint: { x: 0.5, y: 0.8 },
      directionDesc: 'من الأعلى للأسفل'
    };
    setSteps([...steps, newStep]);
    setActiveStepIndex(steps.length);
    setStepMakerMode('start');
  };

  const handleDeleteStep = (indexToDelete: number) => {
    const filtered = steps.filter((_, idx) => idx !== indexToDelete);
    const renumbered = filtered.map((s, idx) => ({
      ...s,
      stepNumber: idx + 1,
      label: `الخطوة ${idx + 1}`
    }));
    setSteps(renumbered);
    if (activeStepIndex >= renumbered.length) {
      setActiveStepIndex(Math.max(0, renumbered.length - 1));
    }
  };

  const handleStepCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stepImageContainerRef.current || steps.length === 0) return;
    const rect = stepImageContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const clickX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const updated = [...steps];
    const curr = { ...updated[activeStepIndex] };

    if (stepMakerMode === 'start') {
      curr.startPoint = { x: Math.round(clickX * 1000) / 1000, y: Math.round(clickY * 1000) / 1000 };
      updated[activeStepIndex] = curr;
      setSteps(updated);
      // Auto-toggle to end mode for easy 2-click placement
      setStepMakerMode('end');
    } else {
      curr.endPoint = { x: Math.round(clickX * 1000) / 1000, y: Math.round(clickY * 1000) / 1000 };
      updated[activeStepIndex] = curr;
      setSteps(updated);
      setStepMakerMode('start');
    }
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
      // Initialize with 1 default step if none exists
      if (steps.length === 0) {
        setSteps([
          {
            id: 'step_' + Date.now(),
            stepNumber: 1,
            label: 'الخطوة 1',
            startPoint: { x: 0.5, y: 0.2 },
            endPoint: { x: 0.5, y: 0.8 },
            directionDesc: 'من البداية إلى النهاية'
          }
        ]);
        setActiveStepIndex(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartEdit = (item: DrawingItem, targetTab: 'upload' | 'step_maker' = 'upload') => {
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
    setSteps(item.steps ? JSON.parse(JSON.stringify(item.steps)) : []);
    setEnableStepsGuide(item.enableStepsGuide ?? ((item.steps && item.steps.length > 0) ? true : false));
    setActiveStepIndex(0);
    setStepMakerMode('start');
    setImageError(null);
    setActiveTab(targetTab);
  };

  useEffect(() => {
    if (isOpen) {
      refreshDrawingsList();
      if (initialEditingDrawingId) {
        const target = drawingEngineService.getDrawingById(initialEditingDrawingId);
        if (target) {
          handleStartEdit(target);
        }
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

    const isPreset = editingDrawingId ? PRESET_DRAWINGS.some(p => p.id === editingDrawingId) : false;

    if (editingDrawingId) {
      // Update existing drawing (custom or preset override)
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
        isCustom: !isPreset,
        createdAt: new Date().toLocaleDateString('ar-SA'),
        steps: steps.length > 0 ? steps : undefined,
        enableStepsGuide: steps.length > 0 ? enableStepsGuide : false
      };

      drawingEngineService.updateAnyDrawing(updatedItem);
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
        createdAt: new Date().toLocaleDateString('ar-SA'),
        steps: steps.length > 0 ? steps : undefined,
        enableStepsGuide: steps.length > 0 ? enableStepsGuide : false
      };

      drawingEngineService.saveCustomDrawing(newItem);
    }

    refreshDrawingsList();
    onDrawingsUpdated();
    resetForm();
    setActiveTab('manage');
  };

  const handleDelete = (id: string, isPreset: boolean) => {
    const confirmMsg = isPreset
      ? 'هل تريد إخفاء هذا الدرس الافتراضي من سبورة الطلاب؟ يمكنك استعادته في أي وقت بنقرة واحدة.'
      : 'هل أنت متأكد من حذف هذه الرسمة المخصصة نهائياً؟';
    if (!window.confirm(confirmMsg)) return;

    drawingEngineService.deleteAnyDrawing(id);
    refreshDrawingsList();
    if (editingDrawingId === id) {
      resetForm();
    }
    onDrawingsUpdated();
  };

  const handleRestorePreset = (id: string) => {
    drawingEngineService.restorePresetDrawing(id);
    refreshDrawingsList();
    onDrawingsUpdated();
  };

  const handleRestoreAllPresets = () => {
    drawingEngineService.restoreAllPresetDrawings();
    refreshDrawingsList();
    onDrawingsUpdated();
  };

  const handleResetPresetToOriginal = (id: string) => {
    if (!window.confirm('هل تريد إلغاء التعديلات واستعادة خطوات وإعدادات النظام الأصلية لهذا الدرس؟')) return;
    drawingEngineService.resetPresetToDefault(id);
    refreshDrawingsList();
    if (editingDrawingId === id) {
      const orig = drawingEngineService.getDrawingById(id);
      if (orig) handleStartEdit(orig);
    }
    onDrawingsUpdated();
  };

  const fallbackCopyText = (text: string): boolean => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Must stay in viewport to prevent browser security blocks, but visually invisible
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.opacity = '0.01';
      textArea.style.zIndex = '-1';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, text.length);
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  };

  const handleDownloadDrawingDataFile = () => {
    try {
      const fileContent = drawingEngineService.generateFullDrawingDataTsFile();
      const blob = new Blob([fileContent], { type: 'text/typescript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drawingData.ts';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFileDownloaded(true);
      setCopyFeedbackMsg('✅ تم تنزيل ملف drawingData.ts بنجاح إلى مجلد التنزيلات!');
      setTimeout(() => {
        setFileDownloaded(false);
        setCopyFeedbackMsg(null);
      }, 5000);
    } catch (e: any) {
      alert('حدث خطأ أثناء تنزيل الملف: ' + (e?.message || 'خطأ غير معروف'));
    }
  };

  const handleDownloadARCanvasFile = () => {
    try {
      const blob = new Blob([arDrawingCanvasRaw], { type: 'text/typescript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ARDrawingCanvas.tsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopyFeedbackMsg('✅ تم تنزيل ملف ARDrawingCanvas.tsx بترميز UTF-8 أصلي وسليم!');
      setTimeout(() => {
        setCopyFeedbackMsg(null);
      }, 5000);
    } catch (e: any) {
      alert('حدث خطأ أثناء تنزيل الملف: ' + (e?.message || 'خطأ غير معروف'));
    }
  };

  const handleDownloadStudentWhiteboardFile = () => {
    try {
      const blob = new Blob([studentWhiteboardViewRaw], { type: 'text/typescript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'StudentWhiteboardView.tsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopyFeedbackMsg('✅ تم تنزيل ملف StudentWhiteboardView.tsx (شاشة الطالب والجوال) بنجاح!');
      setTimeout(() => {
        setCopyFeedbackMsg(null);
      }, 5000);
    } catch (e: any) {
      alert('حدث خطأ أثناء تنزيل الملف: ' + (e?.message || 'خطأ غير معروف'));
    }
  };

  const handleCopyGitHubCode = () => {
    try {
      const code = drawingEngineService.generateFullDrawingDataTsFile();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code)
          .then(() => {
            setGithubCodeCopied(true);
            setCopyFeedbackMsg('✅ تم نسخ الكود كاملاً بنجاح إلى الحافظة!');
            setTimeout(() => {
              setGithubCodeCopied(false);
              setCopyFeedbackMsg(null);
            }, 3500);
          })
          .catch(() => {
            const ok = fallbackCopyText(code);
            if (ok) {
              setGithubCodeCopied(true);
              setCopyFeedbackMsg('✅ تم نسخ الكود كاملاً بنجاح إلى الحافظة!');
              setTimeout(() => {
                setGithubCodeCopied(false);
                setCopyFeedbackMsg(null);
              }, 3500);
            } else {
              setShowCodeBox(true);
              setCopyFeedbackMsg('📋 تم فتح الكود وتحديده أدناه تلقائياً، اضغط Ctrl + C للنسخ!');
              setTimeout(() => handleSelectAllCode(), 100);
            }
          });
      } else {
        const ok = fallbackCopyText(code);
        if (ok) {
          setGithubCodeCopied(true);
          setCopyFeedbackMsg('✅ تم نسخ الكود كاملاً بنجاح إلى الحافظة!');
          setTimeout(() => {
            setGithubCodeCopied(false);
            setCopyFeedbackMsg(null);
          }, 3500);
        } else {
          setShowCodeBox(true);
          setCopyFeedbackMsg('📋 تم فتح الكود وتحديده أدناه تلقائياً، اضغط Ctrl + C للنسخ!');
          setTimeout(() => handleSelectAllCode(), 100);
        }
      }
    } catch {
      setShowCodeBox(true);
      setCopyFeedbackMsg('📋 تم فتح الكود وتحديده أدناه تلقائياً، اضغط Ctrl + C للنسخ!');
      setTimeout(() => handleSelectAllCode(), 100);
    }
  };

  const handleSelectAllCode = () => {
    if (codeTextareaRef.current) {
      codeTextareaRef.current.focus();
      codeTextareaRef.current.select();
    }
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
              setActiveTab('step_maker');
            }}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'step_maker'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>صانع خطوات الحرف (Step Maker) {steps.length > 0 ? `(${steps.length})` : ''}</span>
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
              setActiveTab('multi_device');
            }}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'multi_device'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>تثبيت الدروس لـ GitHub و Vercel 📥</span>
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
          {activeTab === 'upload' && (
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

              {/* Step Maker Shortcut Banner */}
              {imageUrl && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-amber-400" />
                      <span>تحديد خطوات كتابة الحرف ونقاط البداية والنهاية (Step Maker)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {steps.length > 0
                        ? `تم تحديد ${steps.length} خطوات لكتابة هذا الحرف بنقاط بداية خضراء ونهاية حمراء.`
                        : 'حدد أين يبدأ الطالب رسم الحرف وأين ينتهي لتدريبه بالتسلسل الصحيح.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('step_maker')}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 shadow cursor-pointer transition-all"
                  >
                    <span>{steps.length > 0 ? 'تعديل الخطوات 🎯' : 'إعداد خطوات الحرف الآن 🎯'}</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              )}

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
          )}

          {/* Tab 2: Step Maker (محرر خطوات الحرف ونقاط البداية والنهاية) */}
          {activeTab === 'step_maker' && (
            <div className="space-y-4 text-xs">
              {!imageUrl ? (
                <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-700 space-y-4">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
                      <Compass className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">اختر درساً لضبط خطواته أو ارفع صورة جديدة</h4>
                    <p className="text-slate-400 text-xs max-w-md mx-auto">
                      يمكنك تحديد مسار ونقاط البداية 🟢 والنهاية 🔴 لأي حرف أو رسمة في النظام، أو رفع صورة ممسوعة جديدة لخط اليد.
                    </p>
                  </div>

                  {/* Quick Lesson Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[260px] overflow-y-auto p-1">
                    {allDrawingsList.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleStartEdit(item, 'step_maker')}
                        className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 transition-all text-right flex items-center gap-2.5 cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-white p-1 shrink-0 flex items-center justify-center border border-slate-300 shadow-sm">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white group-hover:text-amber-400 truncate text-[11px]">
                            {item.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.steps && item.steps.length > 0 ? `${item.steps.length} خطوات` : 'بدون خطوات'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('upload')}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer shadow flex items-center gap-2"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>رفع صورة ممسوحة جديدة (PNG / SVG)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Active Lesson Header & Switcher */}
                  <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white p-1 border border-slate-300 shadow-sm shrink-0 flex items-center justify-center">
                        <img src={imageUrl} alt={title} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-amber-400 font-semibold">أنت تعدل خطوات الدرس:</div>
                        <div className="text-sm font-bold text-white truncate font-serif">{title || 'بدون عنوان'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl(null);
                          setEditingDrawingId(null);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>اختيار درس آخر</span>
                      </button>
                    </div>
                  </div>

                  {/* Instructions Banner */}
                  <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>طريقة العمل: اضغط على مكان البداية 🟢 ثم مكان النهاية 🔴 على صورة الحرف</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                        {steps.length} {steps.length === 1 ? 'خطوة' : 'خطوات'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      💡 تم إلغاء الخطوط المستقيمة المنقطة لتناسب انحناءات الخط العربي الأصيل. سيظهر للطالب فقط دائرة البداية الخضراء النابضة وعلامة النهاية!
                    </p>
                  </div>

                  {/* Step Selector Pills & Controls */}
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {steps.map((st, idx) => (
                        <button
                          key={st.id || idx}
                          type="button"
                          onClick={() => {
                            setActiveStepIndex(idx);
                            setStepMakerMode('start');
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            activeStepIndex === idx
                              ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/40'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>خطوة {st.stepNumber}</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={handleAddStep}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-dashed border-amber-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة خطوة</span>
                      </button>
                    </div>

                    {steps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStep(activeStepIndex)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        title="حذف الخطوة الحالية"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الخطوة {activeStepIndex + 1}</span>
                      </button>
                    )}
                  </div>

                  {/* Active Step Placement Mode Buttons */}
                  {steps.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setStepMakerMode('start')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          stepMakerMode === 'start'
                            ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30 font-black'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                        <span>1. تحديد نقطة البداية 🟢 (اضغط على الصورة لوضعها)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStepMakerMode('end')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          stepMakerMode === 'end'
                            ? 'bg-rose-600 text-white border-rose-400 shadow-md ring-2 ring-rose-400/30 font-black'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        <Target className="w-4 h-4 text-rose-300" />
                        <span>2. تحديد نقطة النهاية 🔴 (اضغط على الصورة لوضعها)</span>
                      </button>
                    </div>
                  )}

                  {/* Interactive Image Stage */}
                  <div className="space-y-1.5">
                    {/* Background toolbar & Invert (User Request Point 1: حل مشكلة الشاشة السوداء) */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-900 rounded-xl border border-slate-800 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-400 font-semibold text-[11px]">خلفية لوحة التحرير:</span>
                        <button
                          type="button"
                          onClick={() => setStepBgType('white')}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                            stepBgType === 'white'
                              ? 'bg-white text-slate-950 border-amber-400 shadow-md ring-1 ring-amber-400'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                          }`}
                        >
                          📄 ورقة بيضاء (الأوضح لخط اليد)
                        </button>
                        <button
                          type="button"
                          onClick={() => setStepBgType('grid')}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                            stepBgType === 'grid'
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                          }`}
                        >
                          📐 شبكة مربعات
                        </button>
                        <button
                          type="button"
                          onClick={() => setStepBgType('dark')}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                            stepBgType === 'dark'
                              ? 'bg-slate-700 text-white border-amber-400 shadow-md'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                          }`}
                        >
                          ⬛ سبورة داكنة
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setInvertImage(!invertImage)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                          invertImage
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                        title="عكس لون الحبر بين الأسود والأبيض"
                      >
                        <span>🌓 عكس ألوان الحبر</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                      <span>انقر بالفأرة لتثبيت {stepMakerMode === 'start' ? '🟢 نقطة البداية' : '🔴 نقطة النهاية'}</span>
                      <span className="text-amber-400 font-semibold">
                        الخطوة الحالية: {activeStepIndex + 1}
                      </span>
                    </div>

                    {/* Canvas Stage: DEFAULT TO PURE WHITE for crystal clear calligraphy scan */}
                    <div
                      ref={stepImageContainerRef}
                      onClick={handleStepCanvasClick}
                      className={`relative w-full max-w-[560px] mx-auto aspect-[4/3] max-h-[350px] rounded-2xl overflow-hidden border-2 border-amber-500/50 flex items-center justify-center cursor-crosshair select-none shadow-2xl group transition-colors ${
                        stepBgType === 'white'
                          ? 'bg-white'
                          : stepBgType === 'grid'
                          ? 'bg-white bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:16px_16px]'
                          : 'bg-slate-950'
                      }`}
                    >
                      {/* Base Image with optional contrast invert */}
                      <img
                        src={imageUrl}
                        alt="Step Maker Base"
                        style={{ filter: invertImage ? 'invert(1)' : 'none' }}
                        className="w-full h-full object-contain pointer-events-none p-3 select-none"
                      />

                      {/* Straight connecting lines completely REMOVED as requested by user! */}

                      {/* Step Markers Rendered */}
                      {steps.map((st, idx) => {
                        const isActive = idx === activeStepIndex;
                        return (
                          <React.Fragment key={st.id || idx}>
                            {/* Start Point Pin (Green) */}
                            <div
                              style={{
                                left: `${st.startPoint.x * 100}%`,
                                top: `${st.startPoint.y * 100}%`,
                                transform: 'translate(-50%, -50%)'
                              }}
                              className={`absolute z-20 flex items-center justify-center rounded-full pointer-events-none transition-transform ${
                                isActive ? 'scale-110' : 'opacity-85'
                              }`}
                            >
                              <div className="relative flex items-center justify-center">
                                {isActive && (
                                  <span className="absolute w-6 h-6 rounded-full bg-emerald-400/40 animate-ping" />
                                )}
                                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 border border-white shadow-sm ring-2 ring-emerald-400/50" />
                                <span className="absolute -bottom-5 bg-slate-950/95 text-emerald-300 font-bold text-[8.5px] px-2 py-0.5 rounded-full border border-emerald-500/40 whitespace-nowrap shadow-md">
                                  ابدأ {st.stepNumber} 🟢
                                </span>
                              </div>
                            </div>

                            {/* End Point Pin (Red / Target) */}
                            <div
                              style={{
                                left: `${st.endPoint.x * 100}%`,
                                top: `${st.endPoint.y * 100}%`,
                                transform: 'translate(-50%, -50%)'
                              }}
                              className={`absolute z-20 flex items-center justify-center rounded-full pointer-events-none transition-transform ${
                                isActive ? 'scale-110' : 'opacity-85'
                              }`}
                            >
                              <div className="relative flex items-center justify-center">
                                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500 border border-white shadow-sm ring-2 ring-rose-400/40" />
                                <span className="absolute -bottom-5 bg-slate-950/95 text-rose-300 font-bold text-[8.5px] px-2 py-0.5 rounded-full border border-rose-500/40 whitespace-nowrap shadow-md">
                                  نهاية {st.stepNumber} 🔴
                                </span>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step Description & Enforcement Toggle */}
                  {steps.length > 0 && steps[activeStepIndex] && (
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-slate-300 font-semibold text-xs">
                          وصف اتجاه الخطوة {activeStepIndex + 1}:
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {['من اليمين لليسار', 'من الأعلى للأسفل', 'انحناء مقوس', 'نقطة واحدة'].map((txt) => (
                            <button
                              key={txt}
                              type="button"
                              onClick={() => {
                                const upd = [...steps];
                                upd[activeStepIndex].directionDesc = txt;
                                setSteps(upd);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                            >
                              {txt}
                            </button>
                          ))}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={steps[activeStepIndex].directionDesc || ''}
                        onChange={(e) => {
                          const upd = [...steps];
                          upd[activeStepIndex].directionDesc = e.target.value;
                          setSteps(upd);
                        }}
                        placeholder="مثال: من طرف السن اليمين نزولاً ثم الصعود يساراً"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  {/* Enforcement Toggle */}
                  <label className="flex items-center gap-2 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableStepsGuide}
                      onChange={(e) => setEnableStepsGuide(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span>
                      <strong>تفعيل نظام التوجيه والتقييم بالخطوات:</strong> يلزم الطالب بالبدء من النقطة الخضراء المتوهجة لكل خطوة، ويعطي تنبيهاً إذا بدأ من مكان خاطئ.
                    </span>
                  </label>

                  {/* Save Buttons directly in Step Maker */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('upload')}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer"
                    >
                      ← العودة لإعدادات الرسمة
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveDrawing}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/25 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>حفظ خطوات الحرف فوراً وإتاحتها للطلاب</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Manage Drawings (User Question: تعديل وحذف الدروس الافتراضية والمخصصة) */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              {/* Filter Tabs */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-slate-800">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setManageFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      manageFilter === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>جميع الدروس ({allDrawingsList.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManageFilter('custom')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      manageFilter === 'custom'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>الدروس المرفوعة والمخصصة ({customList.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManageFilter('presets')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      manageFilter === 'presets'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>دروس النظام الافتراضية ({PRESET_DRAWINGS.length - hiddenPresetIds.length})</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>رفع درس جديد</span>
                </button>
              </div>

              {/* Notice for Hidden Presets if any */}
              {hiddenPresetIds.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between gap-3 text-xs flex-wrap">
                  <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span>يوجد {hiddenPresetIds.length} من دروس النظام الافتراضية مخفية عن الطلاب حالياً.</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRestoreAllPresets}
                    className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer shadow"
                  >
                    استعادة جميع الدروس المحذوفة 🔄
                  </button>
                </div>
              )}

              {/* Drawings List */}
              {allDrawingsList
                .filter((item) => {
                  if (manageFilter === 'custom') return item.isCustom;
                  if (manageFilter === 'presets') return !item.isCustom;
                  return true;
                })
                .map((item) => {
                  const isPreset = PRESET_DRAWINGS.some(p => p.id === item.id);
                  const isOverridden = isPreset && !!drawingEngineService.getPresetOverrides()[item.id];

                  return (
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-white font-serif truncate">{item.title}</h4>
                            
                            {/* Preset vs Custom Badge */}
                            {isPreset ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0 font-medium">
                                درس افتراضي للنظام 🏛️
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0 font-medium">
                                مخصص / مرفوع 📁
                              </span>
                            )}

                            {isOverridden && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 font-semibold">
                                مُعدّل ✏️
                              </span>
                            )}

                            {item.steps && item.steps.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                {item.steps.length} خطوات مرقمة 🎯
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            دقة مطلوبة {item.targetAccuracy}% · {item.points} نقطة · خط إرشادي: {GUIDE_LINE_COLORS.find(c => c.id === (item.guideColor || 'yellow'))?.name || 'أصفر'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {/* Install & Download Code Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('multi_device');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                          title="تنزيل ملف drawingData.ts لتثبيت الدروس في Vercel و GitHub لجميع الأجهزة"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">تنزيل وتثبيت الكود 📥</span>
                        </button>

                        {/* Step Maker Shortcut Button */}
                        <button
                          onClick={() => handleStartEdit(item, 'step_maker')}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                          title="تعديل وضبط خطوات ونقاط البداية والنهاية"
                        >
                          <Target className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">صانع الخطوات</span>
                        </button>

                        {/* Edit Settings Button */}
                        <button
                          onClick={() => handleStartEdit(item, 'upload')}
                          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                          title="تعديل إعدادات الاسم والشفافية والدقة"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">تعديل</span>
                        </button>

                        {/* Reset Preset to Original if overridden */}
                        {isOverridden && (
                          <button
                            onClick={() => handleResetPresetToOriginal(item.id)}
                            className="p-1.5 sm:px-2 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer text-xs"
                            title="استعادة الإعدادات الأصلية للنظام لهذا الدرس"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete or Hide Button */}
                        <button
                          onClick={() => handleDelete(item.id, isPreset)}
                          className="p-1.5 sm:px-2 sm:py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 transition-colors cursor-pointer"
                          title={isPreset ? 'إخفاء هذا الدرس الافتراضي من النظام' : 'حذف الرسمة نهائياً'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

              {allDrawingsList.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                  <p>لا توجد دروس حالياً.</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                  >
                    رفع درس جديد الآن ←
                  </button>
                </div>
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

          {/* Tab: Permanent GitHub & Vercel Integration (الحل الأنسب والوحيد المعتمد) */}
          {activeTab === 'multi_device' && (
            <div className="space-y-5 text-xs animate-in fade-in duration-200">
              
              {/* Header Explanation Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Globe className="w-5 h-5 shrink-0" />
                  <span>تثبيت جميع الدروس والنقاط في موقعك (Vercel & GitHub)</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-xs">
                  هذا هو <strong>الحل الأنسب والنهائي</strong>: يتم تنزيل ملف بيانات الدروس كاملاً بنقرة زر واحدة واستبداله في كود مشروعك، ثم رفعه إلى GitHub. سيقوم موقع Vercel بالنشر التلقائي فوراً، لتصبح جميع الدروس الجديدة ونقاطها ظاهرة رسمياً وتلقائياً لكل طالب ولكل جهاز (جوال، تابلت، كمبيوتر) يفتح الرابط دون أي روابط أو تعقيد.
                </p>
              </div>

              {/* Solution 3: Permanent Integration into GitHub & Vercel */}
              <div className="p-5 rounded-3xl bg-slate-800/90 border-2 border-emerald-500/40 space-y-4 shadow-2xl">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white font-serif flex items-center gap-2">
                        <span>الحل الأنسب: تثبيت الدروس في كود المشروع لـ GitHub و Vercel</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-sans font-bold">
                          مرة واحدة وتظهر للجميع 🌟
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-300">
                        تضمين الدروس مباشرة في كود المشروع لتصبح جزءاً رسمياً ثابتاً من موقع Vercel يظهر تلقائياً لأي جوال أو تابلت!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Instant Feedback Message Banner */}
                {copyFeedbackMsg && (
                  <div className="p-3.5 rounded-2xl bg-emerald-950/90 border border-emerald-400 text-emerald-200 text-xs font-bold flex items-center gap-2.5 animate-in fade-in shadow-xl">
                    <CheckCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span className="leading-relaxed">{copyFeedbackMsg}</span>
                  </div>
                )}

                {/* Primary Action Buttons: Download File & Copy Code */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  {/* Direct File Download Button (Requested by User) */}
                  <button
                    type="button"
                    onClick={handleDownloadDrawingDataFile}
                    className="flex-1 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/25 transition-all cursor-pointer active:scale-95 border border-emerald-300/40"
                  >
                    <Download className="w-5 h-5 shrink-0" />
                    <span>{fileDownloaded ? '✅ تم تنزيل drawingData.ts بنجاح!' : 'تنزيل ملف drawingData.ts كاملاً وجاهزاً (Download) 📥'}</span>
                  </button>

                  {/* Fallback Copy Button with Bulletproof Fallback */}
                  <button
                    type="button"
                    onClick={handleCopyGitHubCode}
                    className={`px-4 py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                      githubCodeCopied
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg ring-2 ring-emerald-400/40'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    {githubCodeCopied ? (
                      <>
                        <CheckCheck className="w-4 h-4 text-emerald-300" />
                        <span>تم نسخ الكود! ✓</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-amber-400" />
                        <span>نسخ الكود بالكامل 📋</span>
                      </>
                    )}
                  </button>

                  {/* Toggle Visible Code Viewer */}
                  <button
                    type="button"
                    onClick={() => setShowCodeBox(!showCodeBox)}
                    className="px-3.5 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Code className="w-4 h-4 text-sky-400" />
                    <span>{showCodeBox ? 'إخفاء محتوى الكود' : 'معاينة محتوى الكود 🔍'}</span>
                  </button>
                </div>

                {/* Deployment & Sync Guidance Banner */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-200/90 text-right">
                  <span className="text-base shrink-0">💡</span>
                  <div className="space-y-1">
                    <p className="font-bold text-amber-300">
                      ملاحظة هامة لنشر التحديثات على GitHub و Vercel وتجربتها على الجوال والتابلت:
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-200/80">
                      • <strong>شاشة الجوال والتابلت للطلاب</strong> تعمل بواسطة ملف: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300 font-mono">StudentWhiteboardView.tsx</code>
                      <br />
                      • <strong>شاشة استوديو المعلم المباشر</strong> تعمل بواسطة ملف: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-sky-300 font-mono">ARDrawingCanvas.tsx</code>
                      <br />
                      • <strong>قائمة الدروس والخطوات</strong> تحفظ في ملف: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">drawingData.ts</code>
                    </p>
                  </div>
                </div>

                {/* Direct Download for StudentWhiteboardView.tsx (Primary file for Student View on Mobile & Tablet: fixes points offset & scales down beacons) */}
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                  <div className="space-y-0.5 text-right w-full sm:w-auto">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>تنزيل ملف صفحة الطالب والجوال (StudentWhiteboardView.tsx) 📱</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      <strong>الملف الأساسي المسؤول عن تجربة الجوال والتابلت</strong>: يحل مشكلة انزياح النقاط نهائياً ويثبتها على الحرف، ويصغر النقاط ويضيف رقم الخطوة للنص.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadStudentWhiteboardFile}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل StudentWhiteboardView.tsx 📥</span>
                  </button>
                </div>

                {/* Direct Download for ARDrawingCanvas.tsx (Solves Vercel UTF-8 and Teacher Hand Tracking Alignment) */}
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-sky-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="space-y-0.5 text-right w-full sm:w-auto">
                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-sky-400" />
                      <span>تنزيل ملف استوديو المعلم (ARDrawingCanvas.tsx) 💻</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      محفوظ بترميز UTF-8 نقي لمعالجة خطأ Vercel وضمان تطابق هيكل اليد تماماً مع الكاميرا.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadARCanvasFile}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل ARDrawingCanvas.tsx 📥</span>
                  </button>
                </div>

                {/* Visible Code Viewer Box (If toggled or copy fallback) */}
                {showCodeBox && (
                  <div className="space-y-2 p-3 bg-slate-950 rounded-2xl border border-slate-800 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono text-emerald-400">محتوى ملف: src/data/drawingData.ts</span>
                      <button
                        type="button"
                        onClick={handleSelectAllCode}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        تحديد الكل (Select All)
                      </button>
                    </div>
                    <textarea
                      ref={codeTextareaRef}
                      readOnly
                      rows={8}
                      value={drawingEngineService.generateFullDrawingDataTsFile()}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 select-all focus:outline-none"
                    />
                  </div>
                )}

                {/* Super Easy 2-Step Application Guide */}
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 text-slate-300 space-y-2.5 text-xs">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>💡 كيف تطبق هذا التعديل في دقيقة واحدة؟</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed text-[11px]">
                    <li>
                      انقر على زر <strong>«تنزيل ملف drawingData.ts كاملاً وجاهزاً 📥»</strong> ليتم حفظ الملف في جهازك.
                    </li>
                    <li>
                      انسخ الملف الذي تم تنزيله واستبدله بالملف الموجود في مجلد مشروعك في المسار:
                      <code className="text-amber-400 font-mono bg-slate-900 px-2 py-0.5 rounded mr-1 inline-block mt-1">
                        src/data/drawingData.ts
                      </code>
                    </li>
                    <li>
                      ارفع التحديث إلى مستودع GitHub بالأمر:
                      <div className="mt-1 p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-400 select-all">
                        git add src/data/drawingData.ts && git commit -m "تحديث دروس الرسم والنقاط" && git push
                      </div>
                    </li>
                  </ol>
                  <div className="text-[11px] text-emerald-300/90 pt-1 font-semibold flex items-center gap-1.5">
                    <span>🚀 بمجرد رفع التحديث، سيقوم موقع Vercel ببنائه تلقائياً خلال ثوانٍ، وتظهر جميع الدروس الجديدة ونقاطها لكل من يفتح الرابط على الجوال والتابلت فوراً دون الحاجة لأي روابط مشاركة!</span>
                  </div>
                </div>
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
