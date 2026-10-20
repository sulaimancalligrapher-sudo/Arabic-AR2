import React, { useState, useRef, useEffect } from 'react';
import { DrawingItem } from '../../types';
import { ConnectedStudent, whiteboardSyncService } from '../../services/whiteboardSyncService';
import { GUIDE_LINE_COLORS } from '../../services/drawingEngineService';
import {
  Users,
  Radio,
  Play,
  CheckCircle2,
  LogOut,
  Sparkles,
  Settings,
  Send,
  Copy,
  ExternalLink,
  Smartphone,
  Tablet as TabletIcon,
  Monitor,
  Eye,
  EyeOff,
  Hand,
  PenTool,
  Sliders,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen
} from 'lucide-react';

interface TeacherLessonControlSectionProps {
  allDrawings: DrawingItem[];
  roomCode: string;
  connectedStudents: ConnectedStudent[];
  isBoardSessionActive: boolean;
  targetStudentId: string;
  teacherInputMethod: 'hand' | 'touch_mouse';
  showStudentInputToggle: boolean;
  boardLiveStats: { accuracy: number; coverage: number; drawingId: string } | null;
  onUpdateRoomCode: (code: string) => void;
  onSetTargetStudentId: (id: string) => void;
  onToggleSession: () => void;
  onEndLessonAndExit: () => void;
  onClearBoard: () => void;
  onSetGuideColor: (color: 'yellow' | 'green' | 'white' | 'cyan' | 'black') => void;
  onSetInputMethod: (method: 'hand' | 'touch_mouse') => void;
  onToggleStudentInputToggleVisibility: () => void;
  onSendDrawingToWhiteboard: (item: DrawingItem, studentId?: string) => void;
  onSelectDrawing?: (drawing: DrawingItem) => void;
  onOpenAdminModal: () => void;
  onRemoveStudent: (studentId: string) => void;
}

export const TeacherLessonControlSection: React.FC<TeacherLessonControlSectionProps> = ({
  allDrawings,
  roomCode,
  connectedStudents,
  isBoardSessionActive,
  targetStudentId,
  teacherInputMethod,
  showStudentInputToggle,
  boardLiveStats,
  onUpdateRoomCode,
  onSetTargetStudentId,
  onToggleSession,
  onEndLessonAndExit,
  onClearBoard,
  onSetGuideColor,
  onSetInputMethod,
  onToggleStudentInputToggleVisibility,
  onSendDrawingToWhiteboard,
  onSelectDrawing,
  onOpenAdminModal,
  onRemoveStudent
}) => {
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [roomInput, setRoomInput] = useState(roomCode);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const [confirmEndLesson, setConfirmEndLesson] = useState(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>(allDrawings[0]?.id || '');
  const [isLessonDropdownOpen, setIsLessonDropdownOpen] = useState(false);
  const [lessonSearchQuery, setLessonSearchQuery] = useState('');
  const [sendSuccessNote, setSendSuccessNote] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLessonDropdownOpen(false);
      }
    };
    if (isLessonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLessonDropdownOpen]);

  const activeDrawing = allDrawings.find(d => d.id === selectedDrawingId) || allDrawings[0];

  const filteredDrawings = allDrawings.filter(d => {
    if (!lessonSearchQuery.trim()) return true;
    const q = lessonSearchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      (d.titleEn && d.titleEn.toLowerCase().includes(q)) ||
      (d.category && d.category.toLowerCase().includes(q))
    );
  });

  const handleSendSelectedLesson = (drawingToSend?: DrawingItem) => {
    const item = drawingToSend || activeDrawing;
    if (!item) return;
    onSendDrawingToWhiteboard(item, targetStudentId);
    const targetText = targetStudentId === 'all'
      ? `جميع الطلاب المتصلين (${connectedStudents.length})`
      : connectedStudents.find(s => s.id === targetStudentId)?.name || 'الطالب المحدد';
    setSendSuccessNote(`تم إرسال درس "${item.title}" بنجاح إلى ${targetText}! 📡`);
    setTimeout(() => setSendSuccessNote(null), 3500);
  };

  const getWhiteboardUrl = (drawingId?: string) => {
    return whiteboardSyncService.getWhiteboardUrl(drawingId, roomCode);
  };

  const handleCopyLink = () => {
    const url = getWhiteboardUrl();
    navigator.clipboard.writeText(url);
    setCopiedNote('تم نسخ رابط صفحة الطالب إلى الحافظة! 📋');
    setTimeout(() => setCopiedNote(null), 3000);
  };

  const handleOpenStudentView = () => {
    const url = getWhiteboardUrl();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSaveRoomCode = () => {
    const cleaned = roomInput.trim() || '4821';
    onUpdateRoomCode(cleaned);
    setIsEditingRoom(false);
    setCopiedNote(`تم تحديث رمز الغرفة إلى: ${cleaned} 📡`);
    setTimeout(() => setCopiedNote(null), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner: Teacher Classroom Control */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-5 sm:p-7 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
              <span>قسم شرح وتوجيه المعلم (غرفة الصف والبث التفاعلي)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white font-serif">
              إدارة جلسة الرسم المباشرة للطلاب والتحكم بالسبورة عن بُعد
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              تحكم ببدء الجلسة، إرسال الحروف والتمارين لشاشات الطلاب، مراقبة درجاتهم بالبث المباشر، وإنهاء الدرس وإخراج الطلاب بضغطة زر.
            </p>
          </div>

          {/* Room Code & Quick Launch */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-2.5 px-4 flex items-center gap-3 shadow-inner">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-bold">رمز غرفة الصف</span>
                {isEditingRoom ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="text"
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      className="w-20 bg-slate-900 border border-amber-500 rounded px-1.5 py-0.5 text-xs text-amber-300 font-mono font-bold text-center"
                    />
                    <button
                      onClick={handleSaveRoomCode}
                      className="p-1 rounded bg-amber-500 text-slate-950 hover:bg-amber-400"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setRoomInput(roomCode);
                        setIsEditingRoom(false);
                      }}
                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingRoom(true)}
                    className="font-mono text-sm font-black text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="انقر لتعديل رمز الغرفة"
                  >
                    <span>{roomCode}</span>
                    <span className="text-[10px] text-slate-500 font-sans font-normal">(تعديل)</span>
                  </button>
                )}
              </div>
              <div className="w-px h-7 bg-slate-800" />
              <button
                onClick={handleCopyLink}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
                title="نسخ رابط صفحة الطلاب"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenStudentView}
                className="p-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 transition-colors cursor-pointer"
                title="فتح شاشة الطالب في نافذة مستقلة"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onOpenAdminModal}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>إعدادات الإدارة ورفع رسمة</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert Toast */}
        {copiedNote && (
          <div className="mt-4 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{copiedNote}</span>
          </div>
        )}
      </div>

      {/* Teacher Session Master Actions Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full ${isBoardSessionActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <div>
              <h3 className="text-sm font-bold text-white">حالة جلسة الصف الحالية:</h3>
              <p className="text-xs text-slate-400 font-medium">
                {isBoardSessionActive ? '🟢 الجلسة نشطة ومفتوحة أمام الطلاب للرسم' : '⏸️ الجلسة متوقفة حالياً'}
              </p>
            </div>
          </div>

          {/* Master Control Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Toggle Start/Stop Session */}
            <button
              onClick={onToggleSession}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                !isBoardSessionActive
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              }`}
            >
              {!isBoardSessionActive ? (
                <>
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>بدء جلسة الرسم للجميع 🟢</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>إيقاف مؤقت للجلسة ⏸️</span>
                </>
              )}
            </button>

            {/* Clear Board Remotely */}
            <button
              onClick={onClearBoard}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="مسح رسومات جميع الطلاب عن بُعد"
            >
              <span>🧹 مسح اللوحة عن بُعد</span>
            </button>

            {/* End Lesson and Evict Students (إنهاء الدرس وإخراج الطلاب) */}
            {!confirmEndLesson ? (
              <button
                onClick={() => setConfirmEndLesson(true)}
                className="px-4 py-2.5 rounded-2xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 hover:text-white text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/40"
                title="إنهاء الدرس، حفظ النتائج وإخراج وحذف الطلاب من النظام فوراً"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>إنهاء الدرس وإخراج الطلاب 🛑</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 p-1 bg-rose-950 border border-rose-500 rounded-2xl animate-in zoom-in-95">
                <span className="text-[11px] text-rose-200 font-bold px-2">تأكيد إخراج الطلاب وحذفهم؟</span>
                <button
                  onClick={() => {
                    setConfirmEndLesson(false);
                    onEndLessonAndExit();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                >
                  نعم، إخراج فوري
                </button>
                <button
                  onClick={() => setConfirmEndLesson(false)}
                  className="px-2 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Input Method & Guide Color Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Input Method for Students */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">طريقة إدخال ورسم الطلاب:</span>
              <button
                onClick={onToggleStudentInputToggleVisibility}
                className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                {showStudentInputToggle ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>زر التبديل ظاهر للطلاب</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-400">زر التبديل مخفي عن الطلاب</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetInputMethod('hand')}
                className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  teacherInputMethod === 'hand'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Hand className="w-4 h-4" />
                <span>تتبع اليد أمام الكاميرا ✋</span>
              </button>

              <button
                onClick={() => onSetInputMethod('touch_mouse')}
                className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  teacherInputMethod === 'touch_mouse'
                    ? 'bg-sky-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <PenTool className="w-4 h-4" />
                <span>السبورة البيضاء (لمس/ماوس) 🖌️</span>
              </button>
            </div>
          </div>

          {/* Guide Line Color */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
            <span className="text-xs font-bold text-slate-300 block">لون الخط الإرشادي للطلاب:</span>
            <div className="flex items-center gap-2">
              {GUIDE_LINE_COLORS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => onSetGuideColor(col.id as any)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold border border-slate-800 transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-1.5 bg-slate-900 text-slate-200"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: col.hex }}
                  />
                  <span>{col.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Connected Students Roster */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="font-extrabold text-white text-base">
              الطلاب المتصلون حالياً في الصف ({connectedStudents.length})
            </h3>
          </div>

          {/* Target Student Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">توجيه الأوامر إلى:</span>
            <select
              value={targetStudentId}
              onChange={(e) => onSetTargetStudentId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
            >
              <option value="all">جميع الطلاب المتصلين ({connectedStudents.length})</option>
              {connectedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (#{s.number})
                </option>
              ))}
            </select>
          </div>
        </div>

        {connectedStudents.length === 0 ? (
          <div className="py-10 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800/40 space-y-2">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-medium">
              لا يوجد طلاب متصلون حالياً في الغرفة {roomCode}. شارك الرابط أعلاه مع الطلاب للانضمام.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectedStudents.map((st) => (
              <div
                key={st.id}
                className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-sm flex items-center gap-1.5">
                      <span>{st.name}</span>
                      <span className="text-[10px] text-amber-400 font-mono">#{st.number}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      {st.deviceType === 'mobile' ? (
                        <Smartphone className="w-3 h-3 text-slate-400" />
                      ) : st.deviceType === 'tablet' ? (
                        <TabletIcon className="w-3 h-3 text-slate-400" />
                      ) : (
                        <Monitor className="w-3 h-3 text-slate-400" />
                      )}
                      <span>{st.deviceType}</span>
                      <span>•</span>
                      <span
                        className={`font-bold ${
                          st.status === 'drawing'
                            ? 'text-emerald-400'
                            : st.status === 'finished'
                            ? 'text-sky-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {st.status === 'drawing'
                          ? 'يرسم الآن ✍️'
                          : st.status === 'finished'
                          ? 'أكمل الرسم 🏆'
                          : 'في الانتظار ⏳'}
                      </span>
                    </div>
                  </div>

                  {/* Kick / Evict Student */}
                  <button
                    onClick={() => onRemoveStudent(st.id)}
                    className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-400 hover:text-white transition-colors cursor-pointer"
                    title="إخراج وحذف الطالب من الجلسة"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1 pt-1 border-t border-slate-900">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>نسبة الإتقان: {st.accuracy}%</span>
                    <span>التغطية: {st.coverage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${st.accuracy}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Broadcast Gallery: Dropdown Selector for Direct Student Sending */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <span>معرض الدروس للإرسال المباشر للطلاب 🎨</span>
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              اختر الدرس من القائمة المنسدلة لإرساله فوراً لشاشات الطلاب المتصلين أو فتحه للشرح والتطبيق
            </p>
          </div>
          <span className="text-xs font-bold text-amber-400 bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/30 self-start sm:self-auto">
            {allDrawings.length} درس متاح
          </span>
        </div>

        {/* Success Alert Banner on Send */}
        {sendSuccessNote && (
          <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{sendSuccessNote}</span>
          </div>
        )}

        {/* Dropdown Container */}
        <div className="relative" ref={dropdownRef}>
          {/* Dropdown Trigger Button */}
          <button
            type="button"
            onClick={() => setIsLessonDropdownOpen(!isLessonDropdownOpen)}
            className={`w-full bg-slate-950 border rounded-2xl p-3 flex items-center justify-between gap-3 text-right cursor-pointer transition-all shadow-md ${
              isLessonDropdownOpen
                ? 'border-amber-400 ring-2 ring-amber-400/20'
                : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            {activeDrawing ? (
              <div className="flex items-center gap-3 min-w-0">
                {/* Thumbnail with White Background */}
                <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-sm border border-slate-200 flex items-center justify-center shrink-0">
                  <img
                    src={activeDrawing.imageUrl}
                    alt={activeDrawing.title}
                    className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                  />
                </div>
                <div className="min-w-0 text-right">
                  <div className="font-black text-white text-sm sm:text-base truncate flex items-center gap-2">
                    <span>{activeDrawing.title}</span>
                    {activeDrawing.steps && activeDrawing.steps.length > 0 && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono">
                        {activeDrawing.steps.length} خطوات
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono truncate flex items-center gap-2 mt-0.5">
                    <span>{activeDrawing.titleEn || 'Lesson'}</span>
                    <span>•</span>
                    <span className="text-amber-400/90 font-sans">{activeDrawing.category || 'خط عربي'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-xs">اختر درساً من القائمة...</div>
            )}

            <div className="flex items-center gap-2 text-slate-400 shrink-0">
              <span className="text-[11px] hidden sm:inline text-slate-400 font-medium">تغيير الدرس</span>
              {isLessonDropdownOpen ? (
                <ChevronUp className="w-5 h-5 text-amber-400 transition-transform" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400 transition-transform" />
              )}
            </div>
          </button>

          {/* Dropdown Options Popup */}
          {isLessonDropdownOpen && (
            <div className="absolute z-40 top-full mt-2 left-0 right-0 bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl p-3 space-y-2.5 max-h-96 flex flex-col animate-in fade-in zoom-in-95 duration-150">
              {/* Search in Dropdown */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={lessonSearchQuery}
                  onChange={(e) => setLessonSearchQuery(e.target.value)}
                  placeholder="ابحث بالحرف، الاسم، أو التصنيف..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-sans"
                  autoFocus
                />
              </div>

              {/* Scrollable Lesson Items */}
              <div className="overflow-y-auto space-y-1.5 pr-1 max-h-72 custom-scrollbar">
                {filteredDrawings.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    لا يوجد درس يطابق بحثك "{lessonSearchQuery}"
                  </div>
                ) : (
                  filteredDrawings.map((dr) => {
                    const isSelected = dr.id === activeDrawing?.id;
                    return (
                      <div
                        key={dr.id}
                        onClick={() => {
                          setSelectedDrawingId(dr.id);
                          setIsLessonDropdownOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/60 shadow-sm'
                            : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Item Thumbnail on Crisp White Background */}
                          <div className="w-11 h-11 bg-white rounded-xl p-1 shadow-sm border border-slate-200 flex items-center justify-center shrink-0">
                            <img
                              src={dr.imageUrl}
                              alt={dr.title}
                              className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                            />
                          </div>

                          {/* Data details */}
                          <div className="min-w-0 text-right">
                            <div className="font-bold text-white text-xs sm:text-sm truncate flex items-center gap-1.5">
                              <span>{dr.title}</span>
                              {dr.steps && dr.steps.length > 0 && (
                                <span className="text-[10px] bg-slate-800 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                                  {dr.steps.length} خطوات
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                              <span>{dr.titleEn || ''}</span>
                              {dr.category && (
                                <>
                                  <span className="mx-1">•</span>
                                  <span className="text-amber-400/80 font-sans">{dr.category}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right / Status Indicator */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isSelected && (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/30">
                              <Check className="w-3.5 h-3.5" />
                              <span>محدد</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Lesson Preview & Broadcast Action Card */}
        {activeDrawing && (
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-inner">
            <div className="flex items-center gap-4 w-full md:w-auto">
              {/* Large Thumbnail with White Background */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl p-2 shadow-lg border border-slate-700 flex items-center justify-center shrink-0">
                <img
                  src={activeDrawing.imageUrl}
                  alt={activeDrawing.title}
                  className="max-h-full max-w-full object-contain filter drop-shadow-sm"
                />
              </div>

              {/* Information */}
              <div className="space-y-1 text-right min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base sm:text-lg font-black text-white font-serif">
                    {activeDrawing.title}
                  </h4>
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {activeDrawing.titleEn || 'Lesson'}
                  </span>
                  {activeDrawing.steps && activeDrawing.steps.length > 0 && (
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                      {activeDrawing.steps.length} خطوات كتابة
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-medium flex items-center gap-2 flex-wrap">
                  <span>التصنيف: {activeDrawing.category === 'letters' ? 'حروف هجائية' : activeDrawing.category === 'shapes' ? 'أشكال' : 'مخصص'}</span>
                  <span>•</span>
                  <span>الدقة المطلوبة: {activeDrawing.targetAccuracy || 80}%</span>
                  <span>•</span>
                  <span>النقاط: {activeDrawing.points || 100} ⭐</span>
                </div>
                <div className="text-[11px] text-indigo-300 font-semibold flex items-center gap-1.5 pt-0.5">
                  <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  <span>
                    الهدف: {targetStudentId === 'all' ? `جميع الطلاب المتصلين (${connectedStudents.length})` : connectedStudents.find(s => s.id === targetStudentId)?.name || 'طالب محدد'}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Action Buttons */}
            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              {onSelectDrawing && (
                <button
                  type="button"
                  onClick={() => onSelectDrawing(activeDrawing)}
                  className="flex-1 md:flex-initial px-4 py-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                  title="فتح سبورة الرسم التفاعلي للشرح والتجربة المباشرة"
                >
                  <PenTool className="w-4 h-4" />
                  <span>رسم وشرح 🎨</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSendSelectedLesson(activeDrawing)}
                className="flex-1 md:flex-initial px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>إرسال للطلاب 📡</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
