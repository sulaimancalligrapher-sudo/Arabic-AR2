/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Drawing Studio (استوديو الرسم التفاعلي)
 * Standalone Arabic Calligraphy & AR Drawing Application
 */

import React, { useState, useEffect } from 'react';
import { StudioHeader } from './components/StudioHeader';
import { DrawingStudio } from './components/drawing/DrawingStudio';
import { StudentWhiteboardView } from './components/drawing/StudentWhiteboardView';
import { StudentModal } from './components/StudentModal';
import { HandCalibrationModal } from './components/HandCalibrationModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';

import { StudentProfile, GoogleSheetsConfig, ActivityResult } from './types';
import { googleSheetsService } from './services/googleSheetsService';
import { whiteboardSyncService } from './services/whiteboardSyncService';
import { audioService } from './services/audioService';
import { CheckCircle2, Sparkles } from 'lucide-react';

export default function App() {
  // Student Profile State
  const [student, setStudent] = useState<StudentProfile>(() =>
    googleSheetsService.getStudentProfile()
  );

  // Google Sheets Config State
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetsConfig>(() =>
    googleSheetsService.getConfig()
  );

  // Pending items count for Google Sheets sync
  const [pendingCount, setPendingCount] = useState<number>(() => {
    return (
      googleSheetsService.getPendingQueue().length +
      googleSheetsService.getPendingDrawingQueue().length
    );
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [history, setHistory] = useState<ActivityResult[]>(() =>
    googleSheetsService.getHistory()
  );

  // Room Code for teacher and student synchronization
  const [roomCode, setRoomCode] = useState<string>(() =>
    whiteboardSyncService.getRoomCode() || '4821'
  );

  // Standalone Smart Board / Whiteboard Mode (?mode=whiteboard or ?view=board or ?room=...)
  const [isWhiteboardMode, setIsWhiteboardMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (
        params.get('mode') === 'whiteboard' ||
        params.get('view') === 'board' ||
        params.has('room')
      );
    }
    return false;
  });

  const [urlDrawingId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('drawing') || params.get('drawingId') || null;
    }
    return null;
  });

  // Modal States
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const refreshSyncCounts = () => {
    setPendingCount(
      googleSheetsService.getPendingQueue().length +
      googleSheetsService.getPendingDrawingQueue().length
    );
    setHistory(googleSheetsService.getHistory());
  };

  // Sync with Google Sheets
  const handleSyncSheets = async () => {
    setIsSyncing(true);
    const res = await googleSheetsService.syncOfflineQueue();
    setIsSyncing(false);
    refreshSyncCounts();
    setSheetConfig(googleSheetsService.getConfig());
    showToast(res.message);
    if (res.success) {
      audioService.playSuccessSound();
    }
  };

  // Save student profile
  const handleSaveStudent = (updated: StudentProfile) => {
    setStudent(updated);
    googleSheetsService.saveStudentProfile(updated);
    showToast('تم حفظ الملف الشخصي للطالب بنجاح ✨');
  };

  // Save Google Sheets config
  const handleSaveSheetConfig = (updated: GoogleSheetsConfig) => {
    setSheetConfig(updated);
    googleSheetsService.saveConfig(updated);
    showToast('تم حفظ إعدادات شيت جوجل بنجاح 📊');
  };

  // Export CSV
  const handleExportCSV = () => {
    googleSheetsService.exportDrawingCSV();
  };

  // Toggle between Studio & Whiteboard view
  const handleToggleWhiteboardMode = () => {
    setIsWhiteboardMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (next) {
          url.searchParams.set('mode', 'whiteboard');
        } else {
          url.searchParams.delete('mode');
          url.searchParams.delete('view');
          url.searchParams.delete('room');
        }
        window.history.replaceState({}, '', url.toString());
      }
      return next;
    });
  };

  const handleExitWhiteboard = () => {
    setIsWhiteboardMode(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('view');
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Listen to room code updates from whiteboardSyncService
  useEffect(() => {
    const unsub = whiteboardSyncService.subscribe((msg) => {
      if (msg.type === 'STUDENT_FINISHED' && msg.payload) {
        refreshSyncCounts();
        showToast(
          `🎉 إنجاز جديد! أنهى الطالب «${msg.studentName || 'طالب'}» الرسمة بنسبة ${msg.payload.accuracy}%`
        );
      }
    });

    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-white">
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="px-5 py-3 rounded-2xl bg-slate-900/95 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2.5 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {isWhiteboardMode ? (
        /* Standalone Student Whiteboard View */
        <StudentWhiteboardView
          initialDrawingId={urlDrawingId}
          onExit={handleExitWhiteboard}
        />
      ) : (
        /* Standalone Interactive Drawing Studio View */
        <>
          <StudioHeader
            student={student}
            isWhiteboardMode={isWhiteboardMode}
            onToggleWhiteboardMode={handleToggleWhiteboardMode}
            onOpenStudentModal={() => setIsStudentModalOpen(true)}
            onOpenCalibrationModal={() => setIsCalibrationModalOpen(true)}
            onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
            roomCode={roomCode}
            isSheetsConfigured={googleSheetsService.isConfigured()}
            pendingSyncCount={pendingCount}
          />

          <main className="flex-1 pb-16">
            <DrawingStudio
              student={student}
              onUpdateStudent={handleSaveStudent}
              onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
            />
          </main>
        </>
      )}

      {/* Global Modals */}
      <StudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        student={student}
        onSaveStudent={handleSaveStudent}
      />

      <HandCalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => {
          setIsSheetsModalOpen(false);
          refreshSyncCounts();
        }}
        config={sheetConfig}
        onSaveConfig={handleSaveSheetConfig}
        pendingCount={pendingCount}
        history={history}
        onSync={handleSyncSheets}
        onExportCSV={handleExportCSV}
        isSyncing={isSyncing}
      />
    </div>
  );
}
