import React, { useState } from 'react';
import { DrawingItem, StudentProfile } from '../../types';
import {
  Search,
  Sparkles,
  BookOpen,
  Award,
  ChevronLeft,
  Hand,
  PenTool,
  Play
} from 'lucide-react';

interface StudentExerciseSectionProps {
  allDrawings: DrawingItem[];
  student: StudentProfile;
  onSelectDrawing: (drawing: DrawingItem) => void;
  onOpenAddLesson?: () => void;
}

export const StudentExerciseSection: React.FC<StudentExerciseSectionProps> = ({
  allDrawings,
  student,
  onSelectDrawing,
  onOpenAddLesson
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'letters' | 'shapes' | 'custom'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter drawings based on category and search query
  const filteredDrawings = allDrawings.filter((item) => {
    const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchQuery =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.titleEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchQuery;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Student Welcome Header */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/95 to-amber-950/40 p-5 sm:p-7 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>مرحباً يا بطل: {student.name} (#{student.id || '1'})</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white font-serif">
              اختر حرفاً أو شكلاً وابدأ الرسم على السبورة 🎨
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              اختر الدرس المفضل لك، ثم ارسم بتتبع اليد أمام الكاميرا ✋ أو باستخدام الفأرة ولمس الشاشة 🖱️. تُسجل درجاتك فورياً!
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-800 shrink-0">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold">إجمالي النقاط</div>
              <div className="text-lg font-black text-amber-400 font-mono">{student.totalScore}</div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold">النجوم المكتسبة</div>
              <div className="text-lg font-black text-amber-300 font-mono">⭐ {student.stars}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/90 p-4 rounded-3xl border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            جميع الرسومات ({allDrawings.length})
          </button>
          <button
            onClick={() => setSelectedCategory('letters')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'letters'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            🔤 الحروف العربية
          </button>
          <button
            onClick={() => setSelectedCategory('shapes')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'shapes'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            🎨 الأشكال والمجسمات
          </button>
          <button
            onClick={() => setSelectedCategory('custom')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'custom'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white bg-slate-800/60'
            }`}
          >
            ✨ مخصصة
          </button>
        </div>

        {/* Search & Add Lesson */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن حرف أو شكل..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {onOpenAddLesson && (
            <button
              onClick={onOpenAddLesson}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shadow-sm"
              title="إضافة درس أو رسمة جديدة"
            >
              <span>إضافة درس</span>
              <span className="text-sm font-mono">+</span>
            </button>
          )}
        </div>
      </div>

      {/* Drawings Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredDrawings.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectDrawing(item)}
            className="group relative bg-slate-900/90 border border-slate-800 hover:border-amber-500/70 rounded-3xl p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/10 cursor-pointer flex flex-col justify-between"
          >
            {/* Card Preview Image - White Background for Crystal Clear Visibility */}
            <div className="relative aspect-square w-full rounded-2xl bg-white border-2 border-slate-200/90 p-4 mb-3 flex items-center justify-center overflow-hidden shadow-inner group-hover:shadow-md transition-all">
              <img
                src={item.imageUrl}
                alt={item.title}
                className="max-h-full max-w-full object-contain filter drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-950/90 text-amber-400 border border-slate-800 shadow">
                ⭐ {item.points}
              </span>
              <span className="absolute bottom-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300/80">
                أبيض ناصع ⚪
              </span>
            </div>

            {/* Info */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                  {item.title}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {item.titleEn}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1">
                {item.description}
              </p>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                  ✋ كاميرا
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                  🖱️ لمس
                </span>
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
              <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
                <span>ابدأ التمرين</span>
                <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              </span>
              <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
            </div>
          </div>
        ))}

        {filteredDrawings.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800/50 space-y-2">
            <BookOpen className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-medium">لم يتم العثور على رسومات مطابقة للبحث</p>
          </div>
        )}
      </div>
    </div>
  );
};
