import React, { useState } from 'react';
import { GoogleSheetsConfig, ActivityResult } from '../types';
import { GOOGLE_APPS_SCRIPT_TEMPLATE, USER_PROVIDED_SHEET_URL } from '../services/googleSheetsService';
import {
  X,
  Table,
  Copy,
  Check,
  RefreshCw,
  Download,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Sparkles
} from 'lucide-react';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleSheetsConfig;
  onSaveConfig: (cfg: GoogleSheetsConfig) => void;
  pendingCount: number;
  history: ActivityResult[];
  onSync: () => Promise<void>;
  onExportCSV: () => void;
  isSyncing: boolean;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  pendingCount,
  history,
  onSync,
  onExportCSV,
  isSyncing
}) => {
  const [url, setUrl] = useState(config.scriptUrl || USER_PROVIDED_SHEET_URL);
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [copied, setCopied] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...config,
      scriptUrl: url.trim(),
      autoSync
    });
    setSyncStatusMsg('تم حفظ وتحديث رابط Google Apps Script بنجاح!');
    setTimeout(() => setSyncStatusMsg(null), 3500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTriggerSync = async () => {
    setSyncStatusMsg('جارٍ الاتصال بجدول البيانات وإرسال البيانات...');
    try {
      await onSync();
      setSyncStatusMsg('✅ اكتملت المزامنة بنجاح! تم إنشاء وتحديث ورقة Students و Progress في جدولك.');
    } catch {
      setSyncStatusMsg('❌ تعذر الاتصال بجدول البيانات. تأكد من إعداد النشر على Anyone.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-serif">إدارة قاعدة بيانات Google Sheets</h3>
              <p className="text-xs text-slate-400">تخزين ومزامنة نتائج الطلاب والدروس والأنشطة مجاناً</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Automatic Structure Clarification Banner */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-slate-200 leading-relaxed">
              <span className="font-bold text-amber-300 block text-sm">
                هل تحتاج إلى إنشاء أسماء الأوراق أو الأعمدة يدوياً؟
              </span>
              <p>
                <strong>لا إطلاقاً! كل شيء يتم تلقائياً 100%.</strong> كود Google Apps Script المرفق يقوم تلقائياً بإنشاء أوراق (<strong>Students</strong> و <strong>Progress</strong> و <strong>Scores</strong> و <strong>ورقة_الرسم</strong>) مع كافة الأعمدة وتلوين الترويسة بمجرد وصول أول رسالة أو النقر على زر المزامنة التجريبية.
              </p>
            </div>
          </div>

          {/* Status Alert Banner */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${url ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <div className="text-sm font-semibold text-white">
                  {url ? 'رابط Google Apps Script جاهز ومفعل' : 'بانتظار إدخال رابط Google Apps Script'}
                </div>
                <div className="text-xs text-slate-400">
                  العناصر المعلقة في الذاكرة المحلية:{' '}
                  <span className="font-bold text-amber-400">{pendingCount}</span> نتيجة
                  {config.lastSyncTime && (
                    <span className="mr-2">· آخر مزامنة: {config.lastSyncTime}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTriggerSync}
                disabled={isSyncing || !url}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md shadow-emerald-600/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{pendingCount > 0 ? `مزامنة ${pendingCount} نتائج` : 'اختبار الاتصال والإرسال فوراً'}</span>
              </button>

              <button
                type="button"
                onClick={onExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                title="تصدير النتائج إلى ملف CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير CSV</span>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">
                رابط تطبيق ويب Google Apps Script (Web App URL)
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                لا تقلق: لا يتم الاتصال بجداول جوجل مع كل حركة يد، بل تُجمع الإجابات وتُرسل فقط عند اكتمال النشاط أو عند النقر على المزامنة للحفاظ على السرعة الفائقة.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoSync"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
              />
              <label htmlFor="autoSync" className="text-xs text-slate-300 select-none">
                مزامنة النتائج تلقائياً في الخلفية عند اكتمال كل نشاط
              </label>
            </div>

            {syncStatusMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
                {syncStatusMsg}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all"
              >
                حفظ وتأكيد الرابط
              </button>
            </div>
          </form>

          {/* Setup Instructions & Code */}
          <div className="border-t border-slate-800 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white">طريقة إعداد Google Sheets في خطوات بسيطة</h4>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'تم نسخ الكود!' : 'نسخ كود Apps Script'}</span>
              </button>
            </div>

            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 leading-relaxed">
              <li>افتح جدول بيانات جديد في <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-amber-400 underline inline-flex items-center gap-0.5">Google Sheets <ExternalLink className="w-3 h-3" /></a> (اتركه فارغاً، سيتم بناء الجداول تلقائياً).</li>
              <li>من القائمة العلوية، اختر: <strong>الإضافات (Extensions) ← Apps Script</strong>.</li>
              <li>احذف أي كود موجود في ملف <code>Code.gs</code> والصق الكود المنسوخ أعلاه بالكامل، ثم اضغط حفظ 💾.</li>
              <li>انقر على زر <strong>Deploy (نشر) ← New Deployment (نشر جديد)</strong>.</li>
              <li>اضغط على الترس ⚙️ واختر نوع النشر: <strong>Web App (تطبيق ويب)</strong>.</li>
              <li><strong>مهم جداً:</strong> اضبط "Execute as" على <strong>Me</strong>، واضبط "Who has access" على <strong>Anyone (متاح للجميع)</strong>.</li>
              <li>اضغط Deploy وانسخ الرابط الناتج (ينتهي بـ <code>/exec</code>) والصقه في الحقل أعلاه!</li>
            </ol>
          </div>

          {/* Recent Synced Log Table */}
          {history.length > 0 && (
            <div className="border-t border-slate-800 pt-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-300">سجل الإجابات والدرجات الأخيرة (محلياً)</h4>
                <span className="text-[11px] text-slate-500">{history.length} سجل</span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-800/60 text-slate-400 sticky top-0">
                    <tr>
                      <th className="p-2">النشاط</th>
                      <th className="p-2">النتيجة</th>
                      <th className="p-2">النقاط</th>
                      <th className="p-2">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {history.slice(0, 10).map((h, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="p-2 text-slate-300 font-sans">{h.activityType}</td>
                        <td className="p-2">
                          {h.correct ? (
                            <span className="text-emerald-400 font-sans">صحيح ✓</span>
                          ) : (
                            <span className="text-rose-400 font-sans">محاولة ✗</span>
                          )}
                        </td>
                        <td className="p-2 text-amber-400 font-bold">+{h.score}</td>
                        <td className="p-2 text-slate-500 font-sans">{new Date(h.timestamp).toLocaleTimeString('ar-SA')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-800/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
