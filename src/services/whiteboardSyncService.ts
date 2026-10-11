/**
 * Whiteboard Sync Service
 * Real-time two-way synchronization between Teacher Control Dashboard and Student Whiteboard Display
 * Supports:
 * 1. Cloud WebSockets (MQTT over WSS using free public brokers - works seamlessly on Vercel & GitHub with ZERO backend)
 * 2. Cross-device rooms (Online Classroom: 1 Teacher <--> Multiple Independent Students at Home)
 * 3. BroadcastChannel + localStorage fallback for instant zero-latency dual-screen on the same device.
 */

import mqtt, { MqttClient } from 'mqtt';

export interface ConnectedStudent {
  id: string;
  name: string;
  number?: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  status: 'online' | 'waiting' | 'drawing' | 'finished' | 'idle';
  accuracy: number;
  coverage: number;
  score: number;
  currentDrawingId?: string;
  currentDrawingTitle?: string;
  lastSeen: number;
}

export interface WhiteboardSyncMessage {
  type:
    | 'SELECT_DRAWING'
    | 'START_SESSION'
    | 'FINISH_SESSION'
    | 'CLEAR_BOARD'
    | 'SET_GUIDE_COLOR'
    | 'SET_BRUSH_SIZE'
    | 'SET_SENSITIVITY'
    | 'SET_INPUT_METHOD'
    | 'SET_STUDENT_INPUT_TOGGLE_VISIBLE'
    | 'END_LESSON_AND_EXIT'
    | 'STUDENT_JOIN'
    | 'STUDENT_LEAVE'
    | 'STUDENT_HEARTBEAT'
    | 'STUDENT_PROGRESS'
    | 'STUDENT_FINISHED'
    | 'REQUEST_STATE'
    | 'SYNC_STATE';
  roomCode?: string;
  senderRole?: 'teacher' | 'student';
  studentId?: string;
  studentName?: string;
  studentNumber?: string;
  targetStudentId?: string; // 'all' or specific student id
  payload?: any;
  timestamp?: number;
}

const CHANNEL_NAME = 'baseera_smartboard_channel';
const DEFAULT_ROOM = '4821';

// Public free zero-config WebSockets brokers (TLS/WSS)
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];

class WhiteboardSyncService {
  private channel: BroadcastChannel | null = null;
  private mqttClient: MqttClient | null = null;
  private listeners: Set<(msg: WhiteboardSyncMessage) => void> = new Set();
  private studentListeners: Set<(students: ConnectedStudent[]) => void> = new Set();
  
  private currentRole: 'teacher' | 'student' = 'teacher';
  private currentRoomCode: string = DEFAULT_ROOM;
  private currentStudentInfo: { id: string; name: string; number?: string; deviceType: 'mobile' | 'tablet' | 'desktop' } | null = null;
  
  private connectedStudents: Map<string, ConnectedStudent> = new Map();
  private heartbeatInterval: any = null;
  private cleanupInterval: any = null;
  private isMqttConnected: boolean = false;
  private activeBrokerIndex: number = 0;

  constructor() {
    // 1. Initialize local BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch {
        // Fallback
      }
    }

    // 2. Storage event fallback
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'baseera_whiteboard_msg' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            this.handleIncomingMessage(parsed);
          } catch {
            // Ignore
          }
        }
      });
    }

    // Load saved room code if any
    if (typeof window !== 'undefined') {
      const savedRoom = localStorage.getItem('baseera_active_room');
      if (savedRoom) {
        this.currentRoomCode = savedRoom;
      }
    }
  }

  /**
   * Detect device form factor
   */
  public getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (typeof window === 'undefined') return 'desktop';
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
      return 'mobile';
    }
    if (window.innerWidth <= 768) {
      return 'mobile';
    }
    if (window.innerWidth <= 1024) {
      return 'tablet';
    }
    return 'desktop';
  }

  /**
   * Initialize role and connect to Cloud Room via WSS
   */
  public initRole(
    role: 'teacher' | 'student',
    roomCode: string = DEFAULT_ROOM,
    studentInfo?: { id: string; name: string; number?: string }
  ) {
    this.currentRole = role;
    this.currentRoomCode = roomCode || DEFAULT_ROOM;

    if (typeof window !== 'undefined') {
      localStorage.setItem('baseera_active_room', this.currentRoomCode);
    }

    if (role === 'student') {
      const defaultId = 'std_' + Math.random().toString(36).substring(2, 9);
      this.currentStudentInfo = {
        id: studentInfo?.id || defaultId,
        name: studentInfo?.name || 'طالب جديد',
        number: studentInfo?.number || '',
        deviceType: this.getDeviceType()
      };
    }

    this.connectCloudMqtt();
    this.startPeriodicTasks();
  }

  /**
   * Connect to free public WebSockets MQTT broker
   */
  private connectCloudMqtt() {
    if (typeof window === 'undefined') return;

    if (this.mqttClient) {
      try {
        this.mqttClient.end(true);
      } catch {
        // Ignore
      }
      this.mqttClient = null;
    }

    const brokerUrl = BROKERS[this.activeBrokerIndex % BROKERS.length];
    const clientId = `baseera_${this.currentRole}_${Math.random().toString(16).substring(2, 8)}`;

    try {
      this.mqttClient = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 4000
      });

      this.mqttClient.on('connect', () => {
        this.isMqttConnected = true;
        this.subscribeRoomTopics();

        // If student, announce join immediately
        if (this.currentRole === 'student' && this.currentStudentInfo) {
          this.send({
            type: 'STUDENT_JOIN',
            roomCode: this.currentRoomCode,
            senderRole: 'student',
            studentId: this.currentStudentInfo.id,
            studentName: this.currentStudentInfo.name,
            studentNumber: this.currentStudentInfo.number,
            payload: {
              studentNumber: this.currentStudentInfo.number,
              deviceType: this.currentStudentInfo.deviceType
            }
          });
        }
      });

      this.mqttClient.on('message', (topic: string, message: Buffer) => {
        try {
          const parsed = JSON.parse(message.toString());
          this.handleIncomingMessage(parsed);
        } catch {
          // Ignore
        }
      });

      this.mqttClient.on('error', (err: any) => {
        console.warn('MQTT connection notice:', err?.message || err);
        // Fallback to secondary broker if primary fails
        this.activeBrokerIndex++;
      });

      this.mqttClient.on('offline', () => {
        this.isMqttConnected = false;
      });
    } catch (e) {
      console.warn('Could not initialize MQTT WSS client, falling back to local channel:', e);
    }
  }

  private subscribeRoomTopics() {
    if (!this.mqttClient || !this.isMqttConnected) return;

    const teacherTopic = `baseera/classroom/${this.currentRoomCode}/teacher`;
    const studentTopic = `baseera/classroom/${this.currentRoomCode}/students`;

    // Subscribe based on role
    if (this.currentRole === 'teacher') {
      // Teacher listens for student progress, join, finished, and heartbeats
      this.mqttClient.subscribe([studentTopic], { qos: 0 });
    } else {
      // Student listens for teacher commands
      this.mqttClient.subscribe([teacherTopic], { qos: 0 });
    }
  }

  /**
   * Periodic heartbeats for students and cleanup for teacher
   */
  private startPeriodicTasks() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    if (this.currentRole === 'student') {
      // Student sends heartbeat every 5 seconds
      this.heartbeatInterval = setInterval(() => {
        if (this.currentStudentInfo) {
          this.send({
            type: 'STUDENT_HEARTBEAT',
            roomCode: this.currentRoomCode,
            senderRole: 'student',
            studentId: this.currentStudentInfo.id,
            studentName: this.currentStudentInfo.name,
            payload: {
              deviceType: this.currentStudentInfo.deviceType
            }
          });
        }
      }, 5000);
    } else {
      // Teacher checks for inactive students every 4 seconds
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        this.connectedStudents.forEach((student, id) => {
          if (now - student.lastSeen > 16000) {
            // Student timed out
            this.connectedStudents.delete(id);
            changed = true;
          }
        });
        if (changed) {
          this.notifyStudentListeners();
        }
      }, 4000);
    }
  }

  public getRoomCode(): string {
    return this.currentRoomCode;
  }

  public setRoomCode(code: string) {
    this.currentRoomCode = code;
    if (typeof window !== 'undefined') {
      localStorage.setItem('baseera_active_room', code);
    }
    this.subscribeRoomTopics();
  }

  public isConnected(): boolean {
    return this.isMqttConnected;
  }

  public subscribe(callback: (msg: WhiteboardSyncMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public onStudentsChange(callback: (students: ConnectedStudent[]) => void): () => void {
    this.studentListeners.add(callback);
    callback(this.getConnectedStudents());
    return () => this.studentListeners.delete(callback);
  }

  public getConnectedStudents(): ConnectedStudent[] {
    return Array.from(this.connectedStudents.values());
  }

  private notifyStudentListeners() {
    const list = this.getConnectedStudents();
    this.studentListeners.forEach((fn) => {
      try {
        fn(list);
      } catch {
        // Ignore
      }
    });
  }

  private handleIncomingMessage(msg: WhiteboardSyncMessage) {
    if (!msg || !msg.type) return;

    // Filter by room code if specified
    if (msg.roomCode && msg.roomCode !== this.currentRoomCode) {
      return;
    }

    // Filter target student if specified
    if (
      this.currentRole === 'student' &&
      msg.targetStudentId &&
      msg.targetStudentId !== 'all' &&
      this.currentStudentInfo &&
      msg.targetStudentId !== this.currentStudentInfo.id
    ) {
      return;
    }

    // Teacher tracks connected students
    if (this.currentRole === 'teacher') {
      if (msg.senderRole === 'student' && msg.studentId) {
        const studentId = msg.studentId;
        const now = Date.now();
        const existing: ConnectedStudent = this.connectedStudents.get(studentId) || {
          id: studentId,
          name: msg.studentName || 'طالب',
          number: msg.studentNumber || msg.payload?.studentNumber || '',
          deviceType: msg.payload?.deviceType || 'mobile',
          status: 'waiting',
          accuracy: 0,
          coverage: 0,
          score: 0,
          currentDrawingTitle: '',
          currentDrawingId: '',
          lastSeen: now
        };

        existing.lastSeen = now;
        if (msg.studentName) existing.name = msg.studentName;
        if (msg.studentNumber || msg.payload?.studentNumber) existing.number = msg.studentNumber || msg.payload?.studentNumber;
        if (msg.payload?.deviceType) existing.deviceType = msg.payload.deviceType;

        if (msg.type === 'STUDENT_JOIN') {
          existing.status = 'waiting';
        } else if (msg.type === 'STUDENT_PROGRESS') {
          existing.status = msg.payload?.isDrawing ? 'drawing' : 'idle';
          existing.accuracy = msg.payload?.accuracy ?? existing.accuracy;
          existing.coverage = msg.payload?.coverage ?? existing.coverage;
          existing.currentDrawingTitle = msg.payload?.drawingTitle ?? existing.currentDrawingTitle;
          existing.currentDrawingId = msg.payload?.drawingId ?? existing.currentDrawingId;
        } else if (msg.type === 'STUDENT_FINISHED') {
          existing.status = 'finished';
          existing.accuracy = msg.payload?.accuracy ?? existing.accuracy;
          existing.score = msg.payload?.score ?? existing.score;
        } else if (msg.type === 'STUDENT_LEAVE') {
          this.connectedStudents.delete(studentId);
          this.notifyStudentListeners();
          return;
        }

        this.connectedStudents.set(studentId, existing);
        this.notifyStudentListeners();
      }
    }

    // Notify component listeners
    this.notifyListeners(msg);
  }

  private notifyListeners(msg: WhiteboardSyncMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in whiteboard listener:', err);
      }
    });
  }

  /**
   * Broadcast message to room (via WebSockets MQTT + local channel fallback)
   */
  public send(msg: WhiteboardSyncMessage) {
    const enriched: WhiteboardSyncMessage = {
      ...msg,
      roomCode: msg.roomCode || this.currentRoomCode,
      senderRole: msg.senderRole || this.currentRole,
      timestamp: Date.now()
    };

    // 1. Send via Cloud MQTT WSS
    if (this.mqttClient && this.isMqttConnected) {
      const targetTopic =
        enriched.senderRole === 'teacher'
          ? `baseera/classroom/${this.currentRoomCode}/teacher`
          : `baseera/classroom/${this.currentRoomCode}/students`;

      try {
        this.mqttClient.publish(targetTopic, JSON.stringify(enriched), { qos: 0 });
      } catch {
        // Ignore
      }
    }

    // 2. Send via local BroadcastChannel (for same machine)
    if (this.channel) {
      try {
        this.channel.postMessage(enriched);
      } catch {
        // Fallback
      }
    }

    // 3. Storage event fallback
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'baseera_whiteboard_msg',
          JSON.stringify({ ...enriched, _t: Date.now() })
        );
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Teacher helper: Broadcast drawing template to all students or target student
   */
  public sendDrawingToStudents(drawing: any, targetStudentId: string = 'all') {
    this.send({
      type: 'SELECT_DRAWING',
      targetStudentId,
      payload: {
        drawingId: drawing.id,
        drawing
      }
    });
  }

  /**
   * Teacher helper: Start session for students
   */
  public sendStartSession(targetStudentId: string = 'all') {
    this.send({
      type: 'START_SESSION',
      targetStudentId
    });
  }

  /**
   * Teacher helper: Finish session for students
   */
  public sendFinishSession(targetStudentId: string = 'all') {
    this.send({
      type: 'FINISH_SESSION',
      targetStudentId
    });
  }

  /**
   * Teacher helper: Clear canvas
   */
  public sendClearBoard(targetStudentId: string = 'all') {
    this.send({
      type: 'CLEAR_BOARD',
      targetStudentId
    });
  }

  /**
   * Teacher helper: Set guide color
   */
  public sendGuideColor(color: string, targetStudentId: string = 'all') {
    this.send({
      type: 'SET_GUIDE_COLOR',
      targetStudentId,
      payload: { color }
    });
  }

  /**
   * Teacher helper: Remotely set student input method (hand tracking vs whiteboard touch/mouse)
   */
  public sendInputMethod(method: 'hand' | 'touch_mouse', targetStudentId: string = 'all') {
    this.send({
      type: 'SET_INPUT_METHOD',
      targetStudentId,
      payload: { method }
    });
  }

  /**
   * Teacher helper: Control visibility of the input toggle button on the student's page
   */
  public sendStudentInputToggleVisibility(visible: boolean, targetStudentId: string = 'all') {
    this.send({
      type: 'SET_STUDENT_INPUT_TOGGLE_VISIBLE',
      targetStudentId,
      payload: { visible }
    });
  }

  /**
   * Teacher helper: End the current lesson, save student grades, and forcefully exit and delete students from the system
   */
  public sendEndLessonAndExit(targetStudentId: string = 'all') {
    this.send({
      type: 'END_LESSON_AND_EXIT',
      targetStudentId,
      payload: {
        forceExit: true
      }
    });

    // Forceful eviction: remove student(s) from system immediately
    if (targetStudentId === 'all') {
      this.connectedStudents.clear();
    } else {
      this.connectedStudents.delete(targetStudentId);
    }
    this.notifyStudentListeners();
  }

  /**
   * Teacher helper: Remove / kick an individual student from the system
   */
  public removeStudent(studentId: string) {
    this.send({
      type: 'END_LESSON_AND_EXIT',
      targetStudentId: studentId,
      payload: { forceExit: true }
    });
    this.connectedStudents.delete(studentId);
    this.notifyStudentListeners();
  }

  /**
   * Student helper: Disconnect student and stop heartbeats completely upon exit/kick
   */
  public disconnectStudent() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.currentRole === 'student' && this.currentStudentInfo) {
      try {
        this.send({
          type: 'STUDENT_LEAVE',
          studentId: this.currentStudentInfo.id,
          studentName: this.currentStudentInfo.name
        });
      } catch {
        // Ignore
      }
      this.currentStudentInfo = null;
    }
  }

  /**
   * Student helper: Report live progress during drawing
   */
  public reportProgress(data: {
    accuracy: number;
    coverage: number;
    isDrawing: boolean;
    drawingId?: string;
    drawingTitle?: string;
  }) {
    if (this.currentRole !== 'student' || !this.currentStudentInfo) return;

    this.send({
      type: 'STUDENT_PROGRESS',
      studentId: this.currentStudentInfo.id,
      studentName: this.currentStudentInfo.name,
      payload: {
        ...data,
        deviceType: this.currentStudentInfo.deviceType
      }
    });
  }

  /**
   * Student helper: Report completion
   */
  public reportFinished(result: {
    accuracy: number;
    score: number;
    drawingId: string;
    drawingTitle: string;
    durationSeconds: number;
  }) {
    if (this.currentRole !== 'student' || !this.currentStudentInfo) return;

    this.send({
      type: 'STUDENT_FINISHED',
      studentId: this.currentStudentInfo.id,
      studentName: this.currentStudentInfo.name,
      payload: {
        ...result,
        deviceType: this.currentStudentInfo.deviceType
      }
    });
  }

  /**
   * Generate student shareable whiteboard URL for Vercel / GitHub
   */
  public getWhiteboardUrl(drawingId?: string, roomCode?: string): string {
    if (typeof window === 'undefined') return '';
    const room = roomCode || this.currentRoomCode || DEFAULT_ROOM;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('mode', 'whiteboard');
    url.searchParams.set('room', room);
    if (drawingId) {
      url.searchParams.set('drawing', drawingId);
    }
    return url.toString();
  }

  public saveLatestDrawingId(id: string) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('baseera_active_whiteboard_drawing', id);
      } catch {
        // Ignore
      }
    }
  }

  public getLatestDrawingId(): string | null {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('baseera_active_whiteboard_drawing');
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const whiteboardSyncService = new WhiteboardSyncService();
