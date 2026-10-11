import React, { useState } from 'react';
import { DrawingResult, StudentProfile } from '../../types';
import { googleSheetsService } from '../../services/googleSheetsService';
import {
  Table,
  Sparkles,
  Download,
  RefreshCw,
  Award,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  Search,
  Filter
} from 'lucide-react';

interface ProgressTrackingSectionProps {
  student: StudentProfile;
  history: DrawingResult[];
  onOpenSheetsModal: () => void;
  onRefreshHistory: () => void;
}

export const ProgressTrackingSection: React.FC<ProgressTrackingSectionProps> = ({
  student,
  history,
  onOpenSheetsModal,
  onRefreshHistory
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const pendingCount = googleSheetsService.getPendingQueue().length;
  const isSheetsConnected = googleSheetsService.isConfigured();

  // Calculate high-level stats
  const totalCompleted = history.length;
  const avgAccuracy = totalCompleted > 0
    ? Math.round(history.reduce((acc, curr) => acc + curr.accuracy, 0) / totalCompleted)
    : 0;
  const totalPoints = history.reduce((acc, curr) => acc + curr.score, 0);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage('جارٍ مزامنة الدرجات والنتائج مع Google Sheets...');
    try {
      const res = await googleSheetsService.syncOfflineQueue();
      if (res.success) {
        setSyncMessage(`تمت المزامنة بنجاح! تم حفظ ${res.syncedCount} سجل في Google Sheets.`);
      } else {
        setSyncMessage(`تم الحفظ محلياً: ${res.message}`);
      }
      onRefreshHistory();
    } catch {
      setSyncMessage('حدث خطأ أثناء الاتصال بشيت Google. تم حفظ النتائج محلياً.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleExportCSV = () => {
    if (history.length === 0) return;
    const headers = ['التاريخ', 'اسم الطالب', 'رقم الطالب', 'عنوان الرسمة', 'نسبة الإتقان', 'النقاط', 'الوقت بالثواني'];
    const rows = history.map((item) => [
      new Date(item.timestamp).toLocaleString('ar-SA'),
      item.studentName || student.name,
      item.studentNumber || student.id,
      item.drawingTitle,
      `${item.accuracy}%`,
      item.score,
      item.durationSeconds
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `baseera_drawing_scores_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearHistory = () => {
    googleSheetsService.clearDrawingHistory();
    setConfirmClear(false);
    onRefreshHistory();
  };

  const filteredHistory = history.filter((item) =>
    item.drawingTitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (item.studentName && item.studentName.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Overview & Google Sheets Connectivity Card */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 p-5 sm:p-7 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Table className="w-3.5 h-3.5" />
              <span>قسم المتابعة وتسجيل الدرجات في الشيت (Live Scores & Sheets Sync)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white font-serif">
              سجل نتائج الطلاب والمزامنة السحابية مع Google Sheets
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              تسجيل درجات إتقان الطلاب، الوقت المستغرق، ونقاط كل تمرين تلقائياً ومزامنتها لحظياً في جداول البيانات.
            </p>
          </div>

          {/* Sync Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>مزامنة مع Google Sheets الآن {pendingCount > 0 && `(${pendingCount} معلق)`}</span>
            </button>

            <button
              onClick={onOpenSheetsModal}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-amber-400" />
              <span>إعدادات رابط الشيت</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={history.length === 0}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>تصدير CSV</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-slate-950/90 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-bold block">إجمالي التمارين المكتملة</span>
          <div className="text-2xl font-black text-white font-mono">{totalCompleted}</div>
          <span className="text-[11px] text-emerald-400 font-medium">جلسات مسجلة</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-bold block">متوسط نسبة الإتقان</span>
          <div className="text-2xl font-black text-amber-400 font-mono">{avgAccuracy}%</div>
          <span className="text-[11px] text-amber-300 font-medium">دقة تتبع المسار</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-bold block">مجموع النقاط المكتسبة</span>
          <div className="text-2xl font-black text-sky-400 font-mono">{totalPoints}</div>
          <span className="text-[11px] text-sky-300 font-medium">نقاط تراكمية</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-bold block">حالة الربط مع الشيت</span>
          <div className="text-base font-black text-emerald-400 font-mono mt-1">
            {isSheetsConnected ? 'متصل بنجاح 🟢' : 'محلي (جاهز للمزامنة)'}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {pendingCount > 0 ? `${pendingCount} في قائمة الانتظار` : 'جميع السجلات متزامنة'}
          </span>
        </div>
      </div>

      {/* History Data Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-white text-base">
              جدول ورقة النتائج التفصيلي ({filteredHistory.length})
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Search filter */}
            <div className="relative w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="تصفية حسب الدرس أو الطالب..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Clear History Button */}
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={history.length === 0}
                className="p-1.5 rounded-xl bg-slate-950 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="تفريغ السجل"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-950 border border-rose-500 rounded-xl p-1">
                <span className="text-[10px] text-rose-200 font-bold px-1">تأكيد المسح؟</span>
                <button
                  onClick={handleClearHistory}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                >
                  نعم
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800/40 space-y-2">
            <Table className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-medium">
              لا توجد درجات مسجلة حتى الآن. عند إكمال تمرين رسم باليد أو اللمس، ستظهر النتائج هنا فوراً وتُسجل في الشيت.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold">
                  <th className="py-2.5 px-3">التاريخ والوقت</th>
                  <th className="py-2.5 px-3">اسم الطالب</th>
                  <th className="py-2.5 px-3">الرقم</th>
                  <th className="py-2.5 px-3">اسم الدرس / الحرف</th>
                  <th className="py-2.5 px-3 text-center">نسبة الإتقان</th>
                  <th className="py-2.5 px-3 text-center">النقاط</th>
                  <th className="py-2.5 px-3 text-center">المدة</th>
                  <th className="py-2.5 px-3 text-center">حالة الشيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="py-2.5 px-3 text-slate-400 font-mono">
                      {new Date(item.timestamp).toLocaleDateString('ar-SA')} -{' '}
                      {new Date(item.timestamp).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {item.studentName || student.name}
                    </td>
                    <td className="py-2.5 px-3 text-amber-400 font-mono font-bold">
                      #{item.studentNumber || student.id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {item.drawingTitle}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                          item.accuracy >= 85
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                            : item.accuracy >= 60
                            ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {item.accuracy}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-amber-400 font-mono">
                      +{item.score}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                      {item.durationSeconds || 15}ث
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>محفوظ</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
