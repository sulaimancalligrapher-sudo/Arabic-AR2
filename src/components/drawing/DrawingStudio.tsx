import React, { useState, useEffect } from 'react';
import { DrawingItem, DrawingResult, StudentProfile } from '../../types';
import { drawingEngineService } from '../../services/drawingEngineService';
import { googleSheetsService } from '../../services/googleSheetsService';
import { whiteboardSyncService, ConnectedStudent } from '../../services/whiteboardSyncService';
import { ARDrawingCanvas } from './ARDrawingCanvas';
import { DrawingAdminModal } from './DrawingAdminModal';
import { StudentExerciseSection } from './StudentExerciseSection';
import { TeacherLessonControlSection } from './TeacherLessonControlSection';
import { ProgressTrackingSection } from './ProgressTrackingSection';
import {
  Palette,
  Sparkles,
  Settings,
  Table,
  Radio,
  BookOpen,
  Award,
  Users,
  CheckCircle2
} from 'lucide-react';

interface DrawingStudioProps {
  student: StudentProfile;
  onUpdateStudent: (updated: StudentProfile) => void;
  onOpenSheetsModal: () => void;
}

export type StudioSection = 'student_practice' | 'teacher_lesson' | 'progress_tracking';

export const DrawingStudio: React.FC<DrawingStudioProps> = ({
  student,
  onUpdateStudent,
  onOpenSheetsModal
}) => {
  // Active Section: 1- Student Exercises, 2- Teacher Lesson Hub, 3- Progress & Scores Tracking
  const [activeSection, setActiveSection] = useState<StudioSection>('student_practice');

  // Drawings Catalog
  const [allDrawings, setAllDrawings] = useState<DrawingItem[]>(() =>
    drawingEngineService.getAllDrawings()
  );
  const [selectedDrawing, setSelectedDrawing] = useState<DrawingItem | null>(null);

  // Admin & Custom Drawings Modal
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);

  // Classroom Hub & Sync State
  const [roomCode, setRoomCode] = useState<string>(() => whiteboardSyncService.getRoomCode() || '4821');
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [targetStudentId, setTargetStudentId] = useState<string>('all');
  const [isBoardSessionActive, setIsBoardSessionActive] = useState(false);
  const [teacherInputMethod, setTeacherInputMethod] = useState<'hand' | 'touch_mouse'>('hand');
  const [showStudentInputToggle, setShowStudentInputToggle] = useState<boolean>(false);
  const [boardLiveStats, setBoardLiveStats] = useState<{ accuracy: number; coverage: number; drawingId: string } | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // History state for Section 3
  const [drawingHistory, setDrawingHistory] = useState<DrawingResult[]>(() =>
    googleSheetsService.getDrawingHistory()
  );

  const showNotification = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  // Initialize Teacher Role & Subscribe to live room updates
  useEffect(() => {
    whiteboardSyncService.initRole('teacher', roomCode);

    const unsubStudents = whiteboardSyncService.onStudentsChange((list) => {
      setConnectedStudents(list);
    });

    const unsubMsg = whiteboardSyncService.subscribe((msg) => {
      if (msg.type === 'STUDENT_PROGRESS' && msg.payload) {
        setBoardLiveStats({
          accuracy: msg.payload.accuracy,
          coverage: msg.payload.coverage,
          drawingId: msg.payload.drawingId
        });
      } else if (msg.type === 'STUDENT_FINISHED' && msg.payload) {
        showNotification(
          `🎉 أحسنت! أنهى الطالب «${msg.studentName || 'طالب'}» رسمة «${msg.payload.drawingTitle || ''}» بنسبة ${msg.payload.accuracy}%!`
        );
        // Refresh local history
        setDrawingHistory(googleSheetsService.getDrawingHistory());
      }
    });

    return () => {
      unsubStudents();
      unsubMsg();
    };
  }, [roomCode]);

  // Update room code
  const handleUpdateRoomCode = (code: string) => {
    const cleaned = code.trim() || '4821';
    setRoomCode(cleaned);
    whiteboardSyncService.setRoomCode(cleaned);
    whiteboardSyncService.initRole('teacher', cleaned);
    showNotification(`تم تغيير رمز الغرفة إلى: ${cleaned} 📡`);
  };

  // Master Session Controls
  const handleRemoteToggleSession = () => {
    const nextState = !isBoardSessionActive;
    setIsBoardSessionActive(nextState);
    if (nextState) {
      whiteboardSyncService.sendStartSession(targetStudentId);
      showNotification('تم بدء الجلسة لجميع الطلاب بنجاح! 🟢 اختر الحرف أو التمرين لإرساله لهم.');
    } else {
      whiteboardSyncService.sendFinishSession(targetStudentId);
      showNotification('تم إيقاف الجلسة للطلاب مؤقتاً وحفظ النتائج. ⏸️');
    }
  };

  // End Lesson and Evict Students (حذف وإخراج إجباري من النظام)
  const handleRemoteEndLessonAndExit = () => {
    whiteboardSyncService.sendEndLessonAndExit(targetStudentId);
    setIsBoardSessionActive(false);
    // Forcefully remove student(s) from teacher's roster immediately
    setConnectedStudents((prev) =>
      targetStudentId === 'all' ? [] : prev.filter((s) => s.id !== targetStudentId)
    );
    showNotification('تم إنهاء الدرس بنجاح، حذف وإخراج الطلاب من النظام فوراً وحفظ درجاتهم! 🛑');
  };

  // Remove individual student
  const handleRemoveStudent = (studentId: string) => {
    whiteboardSyncService.removeStudent(studentId);
    setConnectedStudents((prev) => prev.filter((s) => s.id !== studentId));
    showNotification('تم إخراج وحذف الطالب من غرفة الصف بنجاح 🚪');
  };

  // Clear Board
  const handleRemoteClearBoard = () => {
    whiteboardSyncService.sendClearBoard(targetStudentId);
    showNotification('تم مسح لوحة الطلاب عن بُعد! 🧹');
  };

  // Guide Color
  const handleRemoteSetGuideColor = (colorId: 'yellow' | 'green' | 'white' | 'cyan' | 'black') => {
    whiteboardSyncService.sendGuideColor(colorId, targetStudentId);
    showNotification('تم تحديث لون الخط الإرشادي للطلاب 🎨');
  };

  // Input Method
  const handleRemoteSetInputMethod = (method: 'hand' | 'touch_mouse') => {
    setTeacherInputMethod(method);
    whiteboardSyncService.sendInputMethod(method, targetStudentId);
    const label = method === 'hand' ? 'حركة اليد أمام الكاميرا ✋' : 'السبورة البيضاء (لمس / ماوس) 🖌️';
    showNotification(`تم ضبط طريقة رسم الطلاب إلى: «${label}» بنجاح!`);
  };

  // Toggle Input Switch Visibility on Student screen
  const handleToggleStudentInputToggleVisibility = () => {
    const nextState = !showStudentInputToggle;
    setShowStudentInputToggle(nextState);
    whiteboardSyncService.sendStudentInputToggleVisibility(nextState, targetStudentId);
    showNotification(
      nextState
        ? 'تم إظهار زر التبديل في صفحة الطلاب بنجاح! 👁️'
        : 'تم إخفاء زر التبديل من صفحة الطلاب (الوضع الافتراضي)! 👁️‍🗨️'
    );
  };

  // Send Drawing to Whiteboard
  const handleSendDrawingToWhiteboard = (item: DrawingItem, studentId: string = targetStudentId) => {
    if (!isBoardSessionActive) {
      showNotification('⚠️ يرجى النقر على زر «بدء جلسة الرسم للجميع 🟢» أولاً قبل اختيار الدرس!');
      return;
    }
    whiteboardSyncService.saveLatestDrawingId(item.id);
    whiteboardSyncService.sendDrawingToStudents(item, studentId);
    const targetLabel = studentId === 'all' ? 'جميع الطلاب 📡' : 'الطالب المحدد 🎯';
    showNotification(`تم إرسال «${item.title}» إلى ${targetLabel}! 🎨`);
  };

  // Drawing completion callback from ARDrawingCanvas
  const handleDrawingComplete = (result: DrawingResult) => {
    // Add points & stars to student profile
    const updatedStudent: StudentProfile = {
      ...student,
      totalScore: student.totalScore + result.score,
      stars: student.stars + (result.accuracy >= 85 ? 3 : 2)
    };
    onUpdateStudent(updatedStudent);
    // Refresh history
    setDrawingHistory(googleSheetsService.getDrawingHistory());
  };

  const handleDrawingsUpdated = () => {
    setAllDrawings(drawingEngineService.getAllDrawings());
  };

  // If a drawing is actively selected, launch fullscreen unified AR Drawing Canvas
  if (selectedDrawing) {
    return (
      <div className="py-2 animate-in fade-in duration-200">
        <ARDrawingCanvas
          drawing={selectedDrawing}
          student={student}
          onBack={() => setSelectedDrawing(null)}
          onComplete={handleDrawingComplete}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Studio Global Navigation Header with 3 Core Sections */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white font-serif flex items-center gap-2">
                <span>استوديو الرسم التفاعلي</span>
                <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                  نظام الأقسام الثلاثة الموحد
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                هيكل معياري موحد: تمارين الطلاب • شرح وإدارة المعلم • المتابعة وتسجيل الدرجات
              </p>
            </div>
          </div>

          {/* 3 Core Section Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 w-full md:w-auto overflow-x-auto">
            {/* 1. Student Practice Section */}
            <button
              onClick={() => setActiveSection('student_practice')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSection === 'student_practice'
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <span>🎓 1. تمارين الطلاب</span>
            </button>

            {/* 2. Teacher Lesson Control Section */}
            <button
              onClick={() => setActiveSection('teacher_lesson')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSection === 'teacher_lesson'
                  ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-indigo-300 animate-pulse" />
              <span>👨‍🏫 2. شرح وإدارة المعلم</span>
              {connectedStudents.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-950 text-indigo-200 border border-indigo-500/40 font-mono">
                  {connectedStudents.length}
                </span>
              )}
            </button>

            {/* 3. Progress Tracking & Scores Section */}
            <button
              onClick={() => setActiveSection('progress_tracking')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSection === 'progress_tracking'
                  ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Table className="w-3.5 h-3.5 text-emerald-300" />
              <span>📊 3. المتابعة وتسجيل الدرجات</span>
              {drawingHistory.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-200 border border-emerald-500/40 font-mono">
                  {drawingHistory.length}
                </span>
              )}
            </button>
          </div>

        </div>

        {/* Global Feedback Toast */}
        {feedbackToast && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
        )}
      </div>

      {/* Render Active Modular Section */}
      {activeSection === 'student_practice' && (
        <StudentExerciseSection
          allDrawings={allDrawings}
          student={student}
          onSelectDrawing={(item) => setSelectedDrawing(item)}
          onOpenAddLesson={() => setIsAdminOpen(true)}
        />
      )}

      {activeSection === 'teacher_lesson' && (
        <TeacherLessonControlSection
          allDrawings={allDrawings}
          roomCode={roomCode}
          connectedStudents={connectedStudents}
          isBoardSessionActive={isBoardSessionActive}
          targetStudentId={targetStudentId}
          teacherInputMethod={teacherInputMethod}
          showStudentInputToggle={showStudentInputToggle}
          boardLiveStats={boardLiveStats}
          onUpdateRoomCode={handleUpdateRoomCode}
          onSetTargetStudentId={(id) => setTargetStudentId(id)}
          onToggleSession={handleRemoteToggleSession}
          onEndLessonAndExit={handleRemoteEndLessonAndExit}
          onClearBoard={handleRemoteClearBoard}
          onSetGuideColor={handleRemoteSetGuideColor}
          onSetInputMethod={handleRemoteSetInputMethod}
          onToggleStudentInputToggleVisibility={handleToggleStudentInputToggleVisibility}
          onSendDrawingToWhiteboard={handleSendDrawingToWhiteboard}
          onSelectDrawing={(item) => setSelectedDrawing(item)}
          onOpenAdminModal={() => setIsAdminOpen(true)}
          onRemoveStudent={handleRemoveStudent}
        />
      )}

      {activeSection === 'progress_tracking' && (
        <ProgressTrackingSection
          student={student}
          history={drawingHistory}
          onOpenSheetsModal={onOpenSheetsModal}
          onRefreshHistory={() => setDrawingHistory(googleSheetsService.getDrawingHistory())}
        />
      )}

      {/* Drawing Admin Modal for uploading custom drawings & parameters */}
      <DrawingAdminModal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          setEditingCustomId(null);
        }}
        onDrawingsUpdated={handleDrawingsUpdated}
        initialEditingDrawingId={editingCustomId}
      />
    </div>
  );
};
