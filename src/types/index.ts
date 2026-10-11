/**
 * Core Types for Baseera Arabic AR Learning Platform
 */

export type StudentLevel = 'مبتدئ' | 'متوسط' | 'متقدم';

export interface StudentProfile {
  id: string;
  name: string;
  email?: string;
  level: StudentLevel;
  totalScore: number;
  completedLessons: string[];
  stars: number;
  streakDays: number;
  registeredDate: string;
}

export interface VocabularyItem {
  id: string;
  arabic: string;
  english: string;
  transliteration: string; // Phonetics for non-native speakers (e.g. "Kitāb")
  category: string;
  image?: string;
  emoji: string;
  audioText?: string;
  exampleSentence?: {
    arabic: string;
    english: string;
  };
}

export type ActivityType =
  | 'match_word_image'
  | 'arrange_sentence'
  | 'build_word'
  | 'missing_letter'
  | 'trace_letter'
  | 'listen_choose'
  | 'classify_words';

export interface ActivityOption {
  id: string;
  text: string;
  emoji?: string;
  image?: string;
  isCorrect?: boolean;
}

export interface LetterStrokePoint {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
}

export interface ActivityDefinition {
  id: string;
  lessonId: string;
  type: ActivityType;
  title: string;
  instruction: string;
  instructionEn: string;
  difficulty: 'سهل' | 'متوسط' | 'تحدي';
  points: number;
  supportsAR: boolean; // Indicates if this activity benefits from Hand Tracking
  // Type specific properties
  question?: string;
  questionEn?: string;
  audioPrompt?: string;
  correctAnswer: string;
  options?: ActivityOption[];
  // For sentence arrangement
  wordsToArrange?: string[];
  // For building word
  lettersToAssemble?: string[];
  // For missing letter
  wordWithBlank?: string; // e.g. "كـ ـاب"
  // For tracing
  traceLetter?: string;
  traceLetterName?: string;
  tracePath?: LetterStrokePoint[];
  // For classification
  categories?: { id: string; label: string; labelEn: string; emoji: string }[];
  itemsToClassify?: { id: string; text: string; emoji: string; categoryId: string }[];
}

export interface Lesson {
  id: string;
  level: StudentLevel;
  order: number;
  title: string;
  titleEn: string;
  topic: string;
  description: string;
  descriptionEn: string;
  coverImage?: string;
  vocabulary: VocabularyItem[];
  activities: ActivityDefinition[];
  grammarTip?: {
    title: string;
    description: string;
  };
}

export interface ActivityResult {
  studentId: string;
  studentName: string;
  lessonId: string;
  activityId: string;
  activityType: ActivityType;
  correct: boolean;
  attempts: number;
  score: number;
  timestamp: string;
  timeSpentSeconds: number;
  inputMode: 'ar_hand' | 'mouse_touch';
  syncedToSheets?: boolean;
}

export interface GoogleSheetsConfig {
  scriptUrl: string;
  autoSync: boolean;
  lastSyncTime?: string;
}

export interface CursorState {
  x: number;
  y: number;
  isPinching: boolean;
  status: 'normal' | 'hover' | 'pinch_outside' | 'grab_success' | 'no_hand';
  handDetected: boolean;
  rawPinchDistance?: number;
}

export type DrawingTolerance = 'easy' | 'normal' | 'strict';
export type DrawingMode = 'trace' | 'color';

export interface DrawingItem {
  id: string;
  title: string;
  titleEn: string;
  category: 'letters' | 'shapes' | 'custom';
  description?: string;
  imageUrl: string; // Base64 Data URL or SVG string/URL
  mode: DrawingMode;
  opacity: number; // 0.15 to 0.60, default ~0.25
  tolerance: DrawingTolerance;
  targetAccuracy: number; // e.g. 70, 80, 85
  points: number;
  arabicAudioText?: string;
  isCustom?: boolean;
  guideColor?: 'yellow' | 'green' | 'white' | 'cyan' | 'black';
  createdAt?: string;
}

export interface DrawingResult {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber?: string;
  drawingId: string;
  drawingTitle: string;
  mode: DrawingMode;
  accuracy: number; // 0 to 100 percentage
  score: number;
  attempts: number;
  timestamp: string;
  durationSeconds: number;
  syncedToSheets?: boolean;
}
