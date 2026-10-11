import { ActivityResult, DrawingResult, GoogleSheetsConfig, StudentProfile } from '../types';

const STORAGE_KEYS = {
  SHEETS_CONFIG: 'baseera_sheets_config',
  RESULTS_QUEUE: 'baseera_results_queue',
  DRAWING_QUEUE: 'baseera_drawing_queue',
  DRAWING_HISTORY: 'baseera_drawing_history',
  STUDENT_PROFILE: 'baseera_student_profile',
  COMPLETED_HISTORY: 'baseera_history_records'
};

// User provided Google Apps Script Web App URL
export const USER_PROVIDED_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbwfa6cT-bMKDqMKNVyf358iOLGew2rZdV_usgu2uK4mT--f8BsxmrE3uT6fyX3XeRc1/exec';

export const DEFAULT_SHEET_CONFIG: GoogleSheetsConfig = {
  scriptUrl: USER_PROVIDED_SHEET_URL,
  autoSync: true,
  lastSyncTime: undefined
};

export const DEFAULT_STUDENT: StudentProfile = {
  id: 'std_' + Math.random().toString(36).substring(2, 9),
  name: 'طالب العربية (Arabic Learner)',
  level: 'مبتدئ',
  totalScore: 0,
  completedLessons: [],
  stars: 0,
  streakDays: 1,
  registeredDate: new Date().toISOString().split('T')[0]
};

/**
 * Google Apps Script snippet for the user to paste into extensions -> Apps Script in Google Sheets
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * Google Apps Script for Baseera Arabic AR Learning Platform
 * ينشئ الجداول وهيكلها وأعمدتها تلقائياً بالكامل دون أي تدخل يدوي!
 * 
 * طريقة التركيب:
 * 1. افتح جدولاً جديداً في Google Sheets
 * 2. اضغط على: الإضافات (Extensions) -> Apps Script
 * 3. استبدل الكود بالكامل بهذا الكود واضغط حفظ (Save)
 * 4. اضغط: Deploy (نشر) -> New Deployment (نشر جديد)
 * 5. اختر النوع: Web App (تطبيق ويب)
 * 6. Execute as: Me (حسابك الشخصي)
 * 7. Who has access: Anyone (متاح للجميع)
 * 8. انسخ رابط تطبيق الويب (ينتهي بـ /exec)
 */

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ورقة الطلاب (Students)
  let sStudents = ss.getSheetByName('Students');
  if (!sStudents) {
    sStudents = ss.insertSheet('Students');
    sStudents.appendRow(['معرف الطالب', 'اسم الطالب', 'البريد الإلكتروني', 'المستوى', 'مجموع النقاط', 'النجوم', 'تاريخ التسجيل', 'آخر نشاط']);
    sStudents.getRange('1:1').setFontWeight('bold').setBackground('#E0F2FE').setHorizontalAlignment('center');
  }

  // 2. ورقة التقدم والنشاطات (Progress)
  let sProgress = ss.getSheetByName('Progress');
  if (!sProgress) {
    sProgress = ss.insertSheet('Progress');
    sProgress.appendRow(['التاريخ والوقت', 'معرف الطالب', 'اسم الطالب', 'معرف الدرس', 'معرف النشاط', 'نوع النشاط', 'النتيجة', 'عدد المحاولات', 'النقاط المكتسبة', 'المدة (ثوانٍ)', 'طريقة الإدخال']);
    sProgress.getRange('1:1').setFontWeight('bold').setBackground('#FEF3C7').setHorizontalAlignment('center');
  }

  // 3. ورقة ملخص الدرجات (Scores)
  let sScores = ss.getSheetByName('Scores');
  if (!sScores) {
    sScores = ss.insertSheet('Scores');
    sScores.appendRow(['معرف الطالب', 'اسم الطالب', 'معرف الدرس', 'مجموع النقاط', 'الإجابات الصحيحة', 'إجمالي المحاولات', 'حالة الإتمام', 'آخر تحديث']);
    sScores.getRange('1:1').setFontWeight('bold').setBackground('#DCFCE7').setHorizontalAlignment('center');
  }

  // 4. ورقة الرسم والتتبع الحركي (Drawing_Records / ورقة_الرسم)
  let sDrawing = ss.getSheetByName('ورقة_الرسم') || ss.getSheetByName('Drawing');
  if (!sDrawing) {
    sDrawing = ss.insertSheet('ورقة_الرسم');
    sDrawing.appendRow(['التاريخ والوقت', 'معرف الطالب', 'اسم الطالب', 'اسم الرسمة', 'نوع النشاط', 'نسبة الدقة %', 'النقاط', 'المحاولات', 'المدة (ثوانٍ)']);
    sDrawing.getRange('1:1').setFontWeight('bold').setBackground('#F3E8FF').setHorizontalAlignment('center');
  }
}

// اختبار عند فتح الرابط في المتصفح مباشرة (GET)
function doGet(e) {
  setupSheets();
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'منظومة بصيرة متصلة بنجاح بجدول بيانات Google! تم تجهيز أوراق العمل بما فيها ورقة الرسم.',
    sheets: ['Students', 'Progress', 'Scores', 'ورقة_الرسم'],
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// استقبال النتائج وحفظها من التطبيق (POST)
function doPost(e) {
  try {
    setupSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let rawData;
    
    if (e.postData && e.postData.contents) {
      rawData = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      rawData = e.parameter;
    } else {
      throw new Error('لا توجد بيانات مستلمة');
    }
    
    // 1. مزامنة نتائج الأنشطة
    if (rawData.results && Array.isArray(rawData.results)) {
      const sProgress = ss.getSheetByName('Progress');
      rawData.results.forEach(res => {
        sProgress.appendRow([
          res.timestamp || new Date().toISOString(),
          res.studentId,
          res.studentName || 'طالب',
          res.lessonId,
          res.activityId,
          res.activityType,
          res.correct ? 'صحيح ✓' : 'محاولة ✗',
          res.attempts,
          res.score,
          res.timeSpentSeconds,
          res.inputMode === 'ar_hand' ? 'تتبع اليد AR' : 'ماوس / لمس'
        ]);
      });
    }

    // 2. مزامنة نتائج استوديو الرسم (Drawing Results)
    if (rawData.drawingResults && Array.isArray(rawData.drawingResults)) {
      const sDrawing = ss.getSheetByName('ورقة_الرسم') || ss.getSheetByName('Drawing');
      rawData.drawingResults.forEach(res => {
        sDrawing.appendRow([
          res.timestamp || new Date().toISOString(),
          res.studentId,
          res.studentName || 'طالب',
          res.drawingTitle || res.drawingId,
          res.mode === 'color' ? 'تلوين الأشكال' : 'تتبع الخط',
          res.accuracy + '%',
          res.score,
          res.attempts,
          res.durationSeconds || 0
        ]);
      });
    }
    
    // 3. تحديث سجل الطالب في ورقة Students
    if (rawData.student) {
      updateStudentRow(ss, rawData.student);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'تم تسجيل البيانات بنجاح في Google Sheets'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateStudentRow(ss, student) {
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == student.id) {
      foundRow = i + 1;
      break;
    }
  }

  const now = new Date().toLocaleString('ar-SA');
  if (foundRow > 0) {
    sheet.getRange(foundRow, 2).setValue(student.name);
    sheet.getRange(foundRow, 4).setValue(student.level);
    sheet.getRange(foundRow, 5).setValue(student.totalScore);
    sheet.getRange(foundRow, 6).setValue(student.stars);
    sheet.getRange(foundRow, 8).setValue(now);
  } else {
    sheet.appendRow([
      student.id,
      student.name,
      student.email || '',
      student.level,
      student.totalScore,
      student.stars,
      student.registeredDate || now,
      now
    ]);
  }
}
`;

class GoogleSheetsService {
  /**
   * Load Google Sheets configuration from localStorage
   */
  public getConfig(): GoogleSheetsConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SHEETS_CONFIG);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.scriptUrl) {
          parsed.scriptUrl = USER_PROVIDED_SHEET_URL;
        }
        return parsed;
      }
      return DEFAULT_SHEET_CONFIG;
    } catch {
      return DEFAULT_SHEET_CONFIG;
    }
  }

  /**
   * Save configuration
   */
  public saveConfig(config: GoogleSheetsConfig): void {
    localStorage.setItem(STORAGE_KEYS.SHEETS_CONFIG, JSON.stringify(config));
  }

  /**
   * Load Student Profile
   */
  public getStudentProfile(): StudentProfile {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.STUDENT_PROFILE);
      return stored ? JSON.parse(stored) : DEFAULT_STUDENT;
    } catch {
      return DEFAULT_STUDENT;
    }
  }

  /**
   * Save Student Profile
   */
  public saveStudentProfile(student: StudentProfile): void {
    localStorage.setItem(STORAGE_KEYS.STUDENT_PROFILE, JSON.stringify(student));
  }

  /**
   * Enqueue activity result for offline safety and batch sync
   */
  public enqueueResult(result: ActivityResult): void {
    try {
      const history = this.getHistory();
      history.unshift(result);
      localStorage.setItem(STORAGE_KEYS.COMPLETED_HISTORY, JSON.stringify(history.slice(0, 200)));

      const queue = this.getPendingQueue();
      queue.push(result);
      localStorage.setItem(STORAGE_KEYS.RESULTS_QUEUE, JSON.stringify(queue));

      const config = this.getConfig();
      if (config.scriptUrl && config.autoSync) {
        this.syncQueue();
      }
    } catch (e) {
      console.error('Failed to store activity result:', e);
    }
  }

  /**
   * Get pending queue
   */
  public getPendingQueue(): ActivityResult[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RESULTS_QUEUE);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get all local history
   */
  public getHistory(): ActivityResult[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.COMPLETED_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Send a test ping / sample record to verify connection immediately
   */
  public async sendTestPing(): Promise<{ success: boolean; message: string }> {
    const config = this.getConfig();
    const student = this.getStudentProfile();

    if (!config.scriptUrl) {
      return { success: false, message: 'يرجى وضع رابط Google Apps Script أولاً.' };
    }

    const testItem: ActivityResult = {
      studentId: student.id,
      studentName: student.name,
      lessonId: 'test_connection',
      activityId: 'ping_' + Date.now().toString().slice(-4),
      activityType: 'match_word_image',
      correct: true,
      attempts: 1,
      score: 100,
      timestamp: new Date().toISOString(),
      timeSpentSeconds: 5,
      inputMode: 'ar_hand'
    };

    try {
      const payload = {
        action: 'save_results',
        student,
        results: [testItem],
        drawingResults: []
      };

      // Sending using mode 'no-cors' so that browser security allows Google Apps Script redirects without blocking
      await fetch(config.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      config.lastSyncTime = new Date().toLocaleTimeString('ar-SA');
      this.saveConfig(config);

      return {
        success: true,
        message: 'تم إرسال سطر تجريبي بنجاح! افتح شيت جوجل وستجد ورقة Progress و Students و ورقة_الرسم جاهزة ومحدثة.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'تعذر الإرسال: ' + (err.message || 'تأكد من اختيار Anyone في إعدادات النشر')
      };
    }
  }

  /**
   * Enqueue drawing result
   */
  public enqueueDrawingResult(result: DrawingResult): void {
    try {
      const history = this.getDrawingHistory();
      history.unshift(result);
      localStorage.setItem(STORAGE_KEYS.DRAWING_HISTORY, JSON.stringify(history.slice(0, 200)));

      const queue = this.getPendingDrawingQueue();
      queue.push(result);
      localStorage.setItem(STORAGE_KEYS.DRAWING_QUEUE, JSON.stringify(queue));

      const config = this.getConfig();
      if (config.scriptUrl && config.autoSync) {
        this.syncQueue();
      }
    } catch (e) {
      console.error('Failed to store drawing result:', e);
    }
  }

  /**
   * Get pending drawing queue
   */
  public getPendingDrawingQueue(): DrawingResult[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DRAWING_QUEUE);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get all local drawing history
   */
  public getDrawingHistory(): DrawingResult[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DRAWING_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Check if Google Sheets URL is configured
   */
  public isConfigured(): boolean {
    return !!this.getConfig().scriptUrl;
  }

  /**
   * Clear all local drawing history
   */
  public clearDrawingHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DRAWING_HISTORY, JSON.stringify([]));
    } catch {
      // Ignore
    }
  }

  /**
   * Synchronize pending offline queue
   */
  public async syncOfflineQueue(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    return this.syncQueue();
  }

  /**
   * Synchronize pending queue to Google Sheets
   */
  public async syncQueue(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    const config = this.getConfig();
    const queue = this.getPendingQueue();
    const drawingQueue = this.getPendingDrawingQueue();
    const student = this.getStudentProfile();

    if (!config.scriptUrl) {
      return {
        success: false,
        syncedCount: 0,
        message: 'لم يتم ربط رابط Google Apps Script بعد. النتائج محفوظة محلياً.'
      };
    }

    if (queue.length === 0 && drawingQueue.length === 0) {
      // If queue is empty, send student profile update as a keep-alive
      return this.sendTestPing().then(res => ({
        success: res.success,
        syncedCount: 1,
        message: res.message
      }));
    }

    try {
      const payload = {
        action: 'save_results',
        student,
        results: queue,
        drawingResults: drawingQueue
      };

      // Crucial: Use mode 'no-cors' so Google Apps Script 302 redirect is processed without CORS error
      await fetch(config.scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      const count = queue.length + drawingQueue.length;
      localStorage.setItem(STORAGE_KEYS.RESULTS_QUEUE, JSON.stringify([])); // Clear queue
      localStorage.setItem(STORAGE_KEYS.DRAWING_QUEUE, JSON.stringify([])); // Clear drawing queue

      config.lastSyncTime = new Date().toLocaleTimeString('ar-SA');
      this.saveConfig(config);

      return {
        success: true,
        syncedCount: count,
        message: `تمت مزامنة ${count} نتيجة (أنشطة + ورقة الرسم) بنجاح مع جدول بيانات جوجل!`
      };
    } catch (err) {
      console.warn('Google Sheets sync error:', err);
      return {
        success: false,
        syncedCount: 0,
        message: 'تعذر الاتصال بـ Google Sheets حالياً، تم الاحتفاظ بالنتائج في الذاكرة المحلية للمزامنة لاحقاً.'
      };
    }
  }

  /**
   * Export all local drawing history as CSV file for direct download
   */
  public exportDrawingCSV(): void {
    const history = this.getDrawingHistory();
    if (history.length === 0) {
      alert('لا توجد نتائج مسجلة في ورقة الرسم حتى الآن للتصدير.');
      return;
    }

    const headers = ['التاريخ', 'اسم الطالب', 'معرف الطالب', 'اسم الرسمة', 'النوع', 'نسبة الدقة', 'النقاط', 'المحاولات', 'المدة (ثوانٍ)'];
    const rows = history.map(item => [
      item.timestamp,
      item.studentName,
      item.studentId,
      item.drawingTitle,
      item.mode === 'color' ? 'تلوين' : 'تتبع خط',
      item.accuracy + '%',
      item.score,
      item.attempts,
      item.durationSeconds
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `baseera_drawing_records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export all local history as CSV file for direct download
   */
  public exportCSV(): void {
    const history = this.getHistory();
    if (history.length === 0) {
      alert('لا توجد نتائج مسجلة حتى الآن للتصدير.');
      return;
    }

    const headers = ['التاريخ', 'اسم الطالب', 'معرف الدرس', 'معرف النشاط', 'النوع', 'النتيجة', 'المحاولات', 'النقاط', 'المدة (ثوانٍ)', 'طريقة الإدخال'];
    const rows = history.map(item => [
      item.timestamp,
      item.studentName,
      item.lessonId,
      item.activityId,
      item.activityType,
      item.correct ? 'صحيح' : 'خطأ',
      item.attempts,
      item.score,
      item.timeSpentSeconds,
      item.inputMode === 'ar_hand' ? 'تتبع اليد AR' : 'ماوس / لمس'
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `baseera_arabic_scores_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const googleSheetsService = new GoogleSheetsService();
