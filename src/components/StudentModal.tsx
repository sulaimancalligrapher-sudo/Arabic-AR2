import React, { useState } from 'react';
import { StudentProfile, StudentLevel } from '../types';
import { X, Award, Star, CheckCircle, UserCheck } from 'lucide-react';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProfile;
  onSaveStudent: (updated: StudentProfile) => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  onClose,
  student,
  onSaveStudent
}) => {
  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email || '');
  const [level, setLevel] = useState<StudentLevel>(student.level);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveStudent({
      ...student,
      name: name.trim() || 'طالب العربية',
      email: email.trim(),
      level
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">ملف الطالب التعليمي</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl text-center">
            <div>
              <div className="text-[11px] text-slate-400">النقاط الكلية</div>
              <div className="text-lg font-bold text-amber-400 flex items-center justify-center gap-1">
                <Star className="w-4 h-4 fill-amber-400" />
                <span>{student.totalScore}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">الدروس المكتملة</div>
              <div className="text-lg font-bold text-emerald-400 flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4" />
                <span>{student.completedLessons.length}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">النجوم المكتسبة</div>
              <div className="text-lg font-bold text-sky-400 flex items-center justify-center gap-1">
                <Award className="w-4 h-4" />
                <span>{student.stars}</span>
              </div>
            </div>
          </div>

          {/* Student ID (Readonly) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              معرف الطالب في النظام (Student ID)
            </label>
            <input
              type="text"
              readOnly
              value={student.id}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950/60 border border-slate-800 rounded-lg text-slate-400 cursor-not-allowed"
            />
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1">
              اسم الطالب (Student Name)
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: John Smith / أحمد"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Email / Code */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1">
              البريد الإلكتروني أو رمز الدخول (Email / Login Code)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Level Selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              مستوى الطالب في اللغة العربية (Proficiency Level)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['مبتدئ', 'متوسط', 'متقدم'] as StudentLevel[]).map((lvl) => (
                <button
                  type="button"
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    level === lvl
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/10'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {lvl}
                  <span className="block text-[10px] opacity-75 font-normal">
                    {lvl === 'مبتدئ' ? 'Beginner' : lvl === 'متوسط' ? 'Intermediate' : 'Advanced'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-lg shadow-amber-500/20 transition-all"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
