import React from 'react';
import { StudentProfile } from '../types';
import {
  Palette,
  Sparkles,
  Sliders,
  Table,
  Radio,
  User,
  Star,
  Trophy,
  Volume2,
  ExternalLink,
  Monitor
} from 'lucide-react';
import { audioService } from '../services/audioService';

interface StudioHeaderProps {
  student: StudentProfile;
  isWhiteboardMode: boolean;
  onToggleWhiteboardMode: () => void;
  onOpenStudentModal: () => void;
  onOpenCalibrationModal: () => void;
  onOpenSheetsModal: () => void;
  roomCode: string;
  isSheetsConfigured: boolean;
  pendingSyncCount: number;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  student,
  isWhiteboardMode,
  onToggleWhiteboardMode,
  onOpenStudentModal,
  onOpenCalibrationModal,
  onOpenSheetsModal,
  roomCode,
  isSheetsConfigured,
  pendingSyncCount
}) => {
  const handleSoundTest = () => {
    audioService.playSuccessSound();
    audioService.speakArabic('مرحباً بكم في استوديو الرسم التفاعلي');
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Logo & Main Branding */}
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 p-0.5 shadow-lg shadow-amber-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400">
                  <Palette className="w-5 h-5 animate-pulse" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                    استوديو الرسم التفاعلي
                  </h1>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    الواقع المعزز AR
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  نظام تفاعلي متكامل للرسم وتتبع حركة اليد والسبورة الذكية الفورية
                </p>
              </div>
            </div>

            {/* Mobile Mode Switcher */}
            <div className="md:hidden">
              <button
                onClick={onToggleWhiteboardMode}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  isWhiteboardMode
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-indigo-600 text-white shadow-md'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>{isWhiteboardMode ? 'الاستوديو الرئيسي' : 'سبورة الطالب'}</span>
              </button>
            </div>
          </div>

          {/* Action Center & Profile Bar */}
          <div className="flex items-center flex-wrap justify-center md:justify-end gap-2 w-full md:w-auto">
            
            {/* View Mode Toggle: Studio vs Student Whiteboard */}
            <div className="hidden md:flex items-center p-1 bg-slate-900 border border-slate-800 rounded-2xl">
              <button
                onClick={() => isWhiteboardMode && onToggleWhiteboardMode()}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isWhiteboardMode
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>الاستوديو والمعلم</span>
              </button>

              <button
                onClick={() => !isWhiteboardMode && onToggleWhiteboardMode()}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isWhiteboardMode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-indigo-300 animate-pulse" />
                <span>سبورة الطالب الذكية</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-mono">
                  {roomCode}
                </span>
              </button>
            </div>

            {/* Hand Calibration Button */}
            <button
              onClick={onOpenCalibrationModal}
              title="معايرة حساسية الكاميرا واليد"
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">معايرة اليد</span>
            </button>

            {/* Google Sheets Sync Button */}
            <button
              onClick={onOpenSheetsModal}
              title="إعدادات ومزامنة شيت جوجل"
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer relative"
            >
              <Table className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">شيت جوجل</span>
              {pendingSyncCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                  {pendingSyncCount}
                </span>
              )}
              {isSheetsConfigured && pendingSyncCount === 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950 animate-pulse"></span>
              )}
            </button>

            {/* Audio Check / Pronounce */}
            <button
              onClick={handleSoundTest}
              title="اختبار الصوت والنطق"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 transition-all cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            {/* Student Profile Chip */}
            <button
              onClick={onOpenStudentModal}
              className="flex items-center gap-2 pl-3 pr-2 py-1 bg-gradient-to-l from-slate-900 to-slate-800/80 hover:to-slate-800 border border-slate-700/80 rounded-2xl transition-all cursor-pointer group shadow-sm"
            >
              <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                <User className="w-4 h-4" />
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                  {student.name}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-amber-400" />
                    {student.stars}
                  </span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">
                    {student.totalScore} نقطة
                  </span>
                </div>
              </div>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
