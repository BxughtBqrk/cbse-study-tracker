import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Square, BarChart3, Clock, BookOpen, Trash2, List, BrainCircuit, Target, AlertTriangle, CheckCircle2, Eye, EyeOff, Cloud, CloudOff, Smartphone, GraduationCap, Briefcase, Edit2, Plus, Check, X, RotateCcw, FolderPlus, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import Webcam from "react-webcam";
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { DEFAULT_COURSES, CBSE_SYLLABUS, CA_INTER_SYLLABUS } from './syllabusData';
import { supabase } from './supabaseClient';
import './index.css';

const PRESET_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

export default function App() {
  // --- MULTI-COURSE STATE ---
  const [currentCourse, setCurrentCourse] = useState(() => {
    return localStorage.getItem('study_active_course') || 'cbse';
  });

  const getInitialSyllabus = (courseId) => {
    try {
      const saved = localStorage.getItem('study_custom_syllabus_' + courseId);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return DEFAULT_COURSES[courseId]?.defaultSyllabus || CBSE_SYLLABUS;
  };

  const [syllabus, setSyllabus] = useState(() => getInitialSyllabus(localStorage.getItem('study_active_course') || 'cbse'));

  // Derived subjects and total chapters from active syllabus
  const subjects = useMemo(() => {
    if (!syllabus) return [];
    return Object.keys(syllabus).map(key => ({
      id: key,
      name: syllabus[key].name || 'Subject',
      color: syllabus[key].color || '#3b82f6',
      books: syllabus[key].books || [],
      chapters: (syllabus[key].books || []).flatMap(b => b.chapters || [])
    }));
  }, [syllabus]);

  const totalChapters = useMemo(() => {
    return subjects.reduce((acc, sub) => acc + sub.chapters.length, 0);
  }, [subjects]);

  const [activeTab, setActiveTab] = useState('stats');
  
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSubject, setActiveSubject] = useState(() => subjects[0]?.id || 'maths');
  const [activeChapter, setActiveChapter] = useState(() => subjects[0]?.chapters[0]?.id || 'm1');
  
  const [isPomodoro, setIsPomodoro] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [examDate, setExamDate] = useState('2027-02-15');
  
  const [isFaceTrackingEnabled, setIsFaceTrackingEnabled] = useState(false);
  const [model, setModel] = useState(null);
  const [focusWarning, setFocusWarning] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [chapterProgress, setChapterProgress] = useState({});
  const [chapterCompletions, setChapterCompletions] = useState({}); 

  // SYLLABUS EDITING STATE
  const [isEditingSyllabus, setIsEditingSyllabus] = useState(false);
  const [newChapterTitles, setNewChapterTitles] = useState({});
  const [editingChapId, setEditingChapId] = useState(null);
  const [editingChapTitle, setEditingChapTitle] = useState('');
  
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('#3b82f6');
  
  const [addingBookSubId, setAddingBookSubId] = useState(null);
  const [newBookName, setNewBookName] = useState('');
  
  const [editingBookKey, setEditingBookKey] = useState(null);
  const [editingBookName, setEditingBookName] = useState('');

  // CLOUD SYNC STATE
  const [syncId, setSyncId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // ADVANCED FEATURES STATE
  const [isSlouching, setIsSlouching] = useState(false);
  const [showEyeRest, setShowEyeRest] = useState(false);
  
  const [isHostageMode, setIsHostageMode] = useState(false);
  const [hostageSessionId, setHostageSessionId] = useState('');
  const [isPhoneConnected, setIsPhoneConnected] = useState(false);
  const [phoneHiddenWarning, setPhoneHiddenWarning] = useState(false);
  const hostageChannelRef = useRef(null);
  const lastHeartbeatRef = useRef(0);

  const timerRef = useRef(null);
  const webcamRef = useRef(null);
  const noFaceFrames = useRef(0);

  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await blazeface.load();
        setModel(loadedModel);
      } catch(e) {}
    };
    loadModel();
  }, []);

  const detectFace = useCallback(async () => {
    if (!isRunning || !isFaceTrackingEnabled || !webcamRef.current || !model || isBreak) return;
    try {
      if (webcamRef.current.video.readyState === 4) {
        const predictions = await model.estimateFaces(webcamRef.current.video, false);
        if (predictions.length > 0) {
          noFaceFrames.current = 0;
          if (focusWarning) setFocusWarning(false);
          
          // Posture Detection: Calculate face bounding box width
          const start = predictions[0].topLeft;
          const end = predictions[0].bottomRight;
          const faceWidth = end[0] - start[0];
          
          // If face width is suspiciously large, they are leaning in too close
          if (faceWidth > 180) {
            if (!isSlouching) setIsSlouching(true);
          } else {
            if (isSlouching) setIsSlouching(false);
          }
        } else {
          noFaceFrames.current += 1;
          if (noFaceFrames.current >= 5) { 
            setIsRunning(false);
            setFocusWarning(true);
            playAlertSound();
          }
        }
      }
    } catch(e) {}
  }, [isRunning, isFaceTrackingEnabled, model, isBreak, focusWarning]);

  useEffect(() => {
    let faceInterval;
    if (isRunning && isFaceTrackingEnabled && !isBreak) {
      faceInterval = setInterval(detectFace, 2000);
    }
    return () => clearInterval(faceInterval);
  }, [isRunning, isFaceTrackingEnabled, isBreak, detectFace]);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  };

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1);
    } catch(e) {}
  };

  // --- PER-COURSE STORAGE & SWITCHING ---
  const loadCourseData = useCallback((courseId) => {
    let s = [], p = {}, c = {}, ed = DEFAULT_COURSES[courseId]?.defaultExamDate || '2027-02-15';
    try {
      const sRaw = localStorage.getItem('study_sessions_' + courseId) || (courseId === 'cbse' ? localStorage.getItem('cbse_study_sessions') : null);
      if (sRaw) s = JSON.parse(sRaw);
      
      const pRaw = localStorage.getItem('study_progress_' + courseId) || (courseId === 'cbse' ? localStorage.getItem('cbse_chapter_progress') : null);
      if (pRaw) p = JSON.parse(pRaw);
      
      const cRaw = localStorage.getItem('study_completions_' + courseId) || (courseId === 'cbse' ? localStorage.getItem('cbse_chapter_completions') : null);
      if (cRaw) c = JSON.parse(cRaw);
      
      const edRaw = localStorage.getItem('study_exam_date_' + courseId) || (courseId === 'cbse' ? localStorage.getItem('cbse_exam_date') : null);
      if (edRaw) ed = edRaw;
    } catch(e) {}
    return { sessions: s, progress: p, completions: c, examDate: ed };
  }, []);

  // INITIAL LOAD
  useEffect(() => {
    const data = loadCourseData(currentCourse);
    setSessions(data.sessions);
    setChapterProgress(data.progress);
    setChapterCompletions(data.completions);
    setExamDate(data.examDate);
    
    const sid = localStorage.getItem('cbse_sync_id');
    if (sid) {
      setSyncId(sid);
      fetchFromCloud(sid, currentCourse);
    }
  }, []);

  const switchCourse = (newCourseId) => {
    if (newCourseId === currentCourse) return;
    if (isRunning) {
      if (!confirm("A focus session is currently running. Switch course and stop timer?")) return;
      setIsRunning(false);
      setTime(0);
    }
    
    // Save current course data
    try {
      localStorage.setItem('study_sessions_' + currentCourse, JSON.stringify(sessions));
      localStorage.setItem('study_progress_' + currentCourse, JSON.stringify(chapterProgress));
      localStorage.setItem('study_completions_' + currentCourse, JSON.stringify(chapterCompletions));
      localStorage.setItem('study_exam_date_' + currentCourse, examDate);
      if (currentCourse === 'cbse') {
        localStorage.setItem('cbse_study_sessions', JSON.stringify(sessions));
        localStorage.setItem('cbse_chapter_progress', JSON.stringify(chapterProgress));
        localStorage.setItem('cbse_chapter_completions', JSON.stringify(chapterCompletions));
        localStorage.setItem('cbse_exam_date', examDate);
      }
    } catch(e) {}

    // Set new course
    setCurrentCourse(newCourseId);
    localStorage.setItem('study_active_course', newCourseId);
    
    // Load new course syllabus & data
    const newSyl = getInitialSyllabus(newCourseId);
    setSyllabus(newSyl);
    
    const data = loadCourseData(newCourseId);
    setSessions(data.sessions);
    setChapterProgress(data.progress);
    setChapterCompletions(data.completions);
    setExamDate(data.examDate);
    
    const newSubs = Object.keys(newSyl).map(key => ({
      id: key,
      chapters: (newSyl[key].books || []).flatMap(b => b.chapters || [])
    }));
    if (newSubs.length > 0) {
      setActiveSubject(newSubs[0].id);
      if (newSubs[0].chapters.length > 0) {
        setActiveChapter(newSubs[0].chapters[0].id);
      }
    }

    if (syncId) {
      fetchFromCloud(syncId, newCourseId);
    }
  };

  // --- SYLLABUS EDITING LOGIC ---
  const saveSyllabus = (updatedSyllabus) => {
    setSyllabus(updatedSyllabus);
    try {
      localStorage.setItem('study_custom_syllabus_' + currentCourse, JSON.stringify(updatedSyllabus));
    } catch(e) {}
  };

  const handleAddChapter = (subId, bookIdx) => {
    const titleKey = subId + '_' + bookIdx;
    const title = (newChapterTitles[titleKey] || '').trim();
    if (!title) return;
    
    const clone = JSON.parse(JSON.stringify(syllabus));
    if (!clone[subId] || !clone[subId].books[bookIdx]) return;
    
    const newId = 'chap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    if (!clone[subId].books[bookIdx].chapters) clone[subId].books[bookIdx].chapters = [];
    clone[subId].books[bookIdx].chapters.push({
      id: newId,
      title: title
    });
    
    saveSyllabus(clone);
    setNewChapterTitles(prev => ({ ...prev, [titleKey]: '' }));
  };

  const handleStartEditChapter = (chap) => {
    setEditingChapId(chap.id);
    setEditingChapTitle(chap.title);
  };

  const handleSaveEditChapter = (subId, bookIdx, chapId) => {
    if (!editingChapTitle.trim()) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    const book = clone[subId]?.books[bookIdx];
    if (!book) return;
    const chap = book.chapters.find(c => c.id === chapId);
    if (chap) {
      chap.title = editingChapTitle.trim();
      saveSyllabus(clone);
    }
    setEditingChapId(null);
    setEditingChapTitle('');
  };

  const handleDeleteChapter = (subId, bookIdx, chapId) => {
    if (!confirm("Are you sure you want to delete this chapter/topic?")) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    const book = clone[subId]?.books[bookIdx];
    if (!book) return;
    book.chapters = book.chapters.filter(c => c.id !== chapId);
    saveSyllabus(clone);
    
    const newProg = { ...chapterProgress };
    delete newProg[chapId];
    setChapterProgress(newProg);
    localStorage.setItem('study_progress_' + currentCourse, JSON.stringify(newProg));
  };

  const handleAddBook = (subId) => {
    if (!newBookName.trim()) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    if (!clone[subId]) return;
    if (!clone[subId].books) clone[subId].books = [];
    clone[subId].books.push({
      name: newBookName.trim(),
      chapters: []
    });
    saveSyllabus(clone);
    setAddingBookSubId(null);
    setNewBookName('');
  };

  const handleSaveEditBook = (subId, bookIdx) => {
    if (!editingBookName.trim()) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    if (clone[subId]?.books[bookIdx]) {
      clone[subId].books[bookIdx].name = editingBookName.trim();
      saveSyllabus(clone);
    }
    setEditingBookKey(null);
    setEditingBookName('');
  };

  const handleDeleteBook = (subId, bookIdx) => {
    if (!confirm("Delete this module and all its chapters?")) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    if (clone[subId]?.books) {
      clone[subId].books.splice(bookIdx, 1);
      saveSyllabus(clone);
    }
  };

  const handleAddSubject = () => {
    if (!newSubjectName.trim()) return;
    const key = 'sub_' + Date.now();
    const clone = JSON.parse(JSON.stringify(syllabus));
    clone[key] = {
      name: newSubjectName.trim(),
      color: newSubjectColor || '#3b82f6',
      books: [
        { name: 'Module 1', chapters: [] }
      ]
    };
    saveSyllabus(clone);
    setActiveSubject(key);
    setIsAddingSubject(false);
    setNewSubjectName('');
  };

  const handleDeleteSubject = (subId) => {
    if (Object.keys(syllabus).length <= 1) {
      alert("You cannot delete the only remaining subject!");
      return;
    }
    if (!confirm(`Delete subject "${syllabus[subId]?.name}" and all its chapters?`)) return;
    const clone = JSON.parse(JSON.stringify(syllabus));
    delete clone[subId];
    saveSyllabus(clone);
    const remaining = Object.keys(clone);
    setActiveSubject(remaining[0]);
  };

  const handleResetSyllabus = () => {
    const courseObj = DEFAULT_COURSES[currentCourse];
    if (!confirm(`Reset ${courseObj?.name} syllabus to official default? Any custom chapters added will be replaced.`)) return;
    const def = courseObj?.defaultSyllabus || CBSE_SYLLABUS;
    localStorage.removeItem('study_custom_syllabus_' + currentCourse);
    setSyllabus(def);
    setIsEditingSyllabus(false);
  };

  // --- CLOUD SYNC ---
  const fetchFromCloud = async (id, courseToUse = currentCourse) => {
    setIsSyncing(true);
    try {
      const syncKey = id + '_' + courseToUse;
      let { data } = await supabase.from('user_stats').select('*').eq('sync_id', syncKey).single();
      if (!data && courseToUse === 'cbse') {
        const res = await supabase.from('user_stats').select('*').eq('sync_id', id).single();
        data = res.data;
      }
      if (data) {
        setSessions(data.sessions || []);
        setChapterProgress(data.progress || {});
        setChapterCompletions(data.completions || {});
        localStorage.setItem('study_sessions_' + courseToUse, JSON.stringify(data.sessions || []));
        localStorage.setItem('study_progress_' + courseToUse, JSON.stringify(data.progress || {}));
        localStorage.setItem('study_completions_' + courseToUse, JSON.stringify(data.completions || {}));
      }
    } catch(e) {
      console.error("Fetch error", e);
    }
    setIsSyncing(false);
  };

  const saveToCloud = async (idToUse, s, p, c) => {
    if (!idToUse) return;
    setIsSyncing(true);
    try {
      const syncKey = idToUse + '_' + currentCourse;
      await supabase.from('user_stats').upsert({
        sync_id: syncKey,
        sessions: s,
        progress: p,
        completions: c,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sync_id' });

      if (currentCourse === 'cbse') {
        await supabase.from('user_stats').upsert({
          sync_id: idToUse,
          sessions: s,
          progress: p,
          completions: c,
          updated_at: new Date().toISOString()
        }, { onConflict: 'sync_id' });
      }
    } catch(e) { console.error("Save error", e); }
    setIsSyncing(false);
  };

  const linkDevice = async () => {
    let newId = prompt("Enter a unique Sync ID (e.g. aryan2027 or sister_ca). Use the same ID on devices to sync:");
    if (!newId) return;
    newId = newId.trim().toLowerCase();
    
    setSyncId(newId);
    localStorage.setItem('cbse_sync_id', newId);
    await fetchFromCloud(newId, currentCourse);
    if (sessions.length > 0 || Object.keys(chapterProgress).length > 0) {
      saveToCloud(newId, sessions, chapterProgress, chapterCompletions);
    }
    alert("Device linked successfully! Your stats will now sync automatically.");
  };

  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (isRunning) {
      lastTickRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const delta = Math.round((now - lastTickRef.current) / 1000);
        
        if (delta >= 1) {
          lastTickRef.current = now;
          setTime((prev) => {
            if (isPomodoro) {
              if (prev - delta <= 0) {
                playChime(); setIsRunning(false); setIsBreak(!isBreak);
                return isBreak ? 1500 : 300; 
              }
              return prev - delta;
            } else return prev + delta;
          });
        }
      }, 1000);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [isRunning, isPomodoro, isBreak]);

  useEffect(() => {
    if (!isRunning) {
      if (isPomodoro) setTime(isBreak ? 300 : 1500);
      else setTime(0);
    }
  }, [isPomodoro, isBreak]);

  // 20-20-20 Eye Strain Protector
  useEffect(() => {
    // Every 20 minutes (1200 seconds) of active non-break time
    if (isRunning && !isBreak && time > 0 && time % 1200 === 0) {
      setShowEyeRest(true);
      playChime();
      setTimeout(() => setShowEyeRest(false), 20000); // 20 seconds
    }
  }, [time, isRunning, isBreak]);

  useEffect(() => {
    const sub = subjects.find(s => s.id === activeSubject);
    if (sub && sub.chapters.length > 0) {
      const exists = sub.chapters.some(c => c.id === activeChapter);
      if (!exists) setActiveChapter(sub.chapters[0].id);
    }
  }, [activeSubject, subjects]);

  // Mobile Client Hostage Logic
  const isHostageClient = window.location.search.includes('hostage=');
  const hostageClientId = new URLSearchParams(window.location.search).get('hostage');
  
  useEffect(() => {
    if (isHostageClient && hostageClientId) {
      document.body.style.backgroundColor = '#000000';
      let wakeLock = null;
      const requestWakeLock = async () => {
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
        catch (err) {}
      };
      requestWakeLock();

      const channel = supabase.channel(`hostage_${hostageClientId}`, {
        config: { presence: { key: 'phone' } }
      });
      
      let heartbeatInterval;
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online: true });
          heartbeatInterval = setInterval(() => {
            const isVisible = document.visibilityState === 'visible';
            channel.send({ type: 'broadcast', event: 'heartbeat', payload: { visible: isVisible } });
          }, 2000);
        }
      });
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') requestWakeLock();
        channel.send({ type: 'broadcast', event: 'heartbeat', payload: { visible: document.visibilityState === 'visible' } });
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        if (wakeLock) wakeLock.release().catch(()=>{});
        clearInterval(heartbeatInterval);
        document.removeEventListener('visibilitychange', handleVisibility);
        channel.untrack();
      }
    }
  }, [isHostageClient, hostageClientId]);

  // Desktop Hostage Watchdog
  useEffect(() => {
    let watchdogInterval;
    if (isRunning && isHostageMode && isPhoneConnected) {
      watchdogInterval = setInterval(() => {
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;
        if (timeSinceLastHeartbeat > 5000) { // 5 seconds without ping = dead
          setPhoneHiddenWarning(true);
          setIsRunning(false);
          setIsPhoneConnected(false);
          playAlertSound();
        }
      }, 1000);
    }
    return () => clearInterval(watchdogInterval);
  }, [isRunning, isHostageMode, isPhoneConnected]);

  const toggleTimer = () => {
    if (!isRunning) { 
      setFocusWarning(false); 
      noFaceFrames.current = 0; 
      
      if (isHostageMode && !isPhoneConnected) {
        if (!hostageSessionId) {
          const newId = Math.random().toString(36).substring(7);
          setHostageSessionId(newId);
          const channel = supabase.channel(`hostage_${newId}`, {
            config: { presence: { key: 'phone' } }
          });
          channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            if (Object.keys(state).length === 0) {
              setPhoneHiddenWarning(true);
              setIsRunning(false);
              setIsPhoneConnected(false);
              playAlertSound();
            } else {
              lastHeartbeatRef.current = Date.now();
              setIsPhoneConnected(true);
              setPhoneHiddenWarning(false);
              setIsRunning(true);
            }
          });
          channel.on('broadcast', { event: 'heartbeat' }, (payload) => {
            if (payload.payload.visible) {
              lastHeartbeatRef.current = Date.now();
              setIsPhoneConnected(prev => prev ? prev : true);
              setPhoneHiddenWarning(prev => prev ? false : prev);
              setIsRunning(prev => prev ? prev : true);
            } else {
              setPhoneHiddenWarning(true);
              setIsRunning(false);
              setIsPhoneConnected(false);
              playAlertSound();
            }
          }).subscribe();
          hostageChannelRef.current = channel;
        }
        return; // Don't start timer immediately, wait for phone to connect
      }
    }
    setIsRunning(!isRunning);
  };

  const finishSession = () => {
    let duration = time;
    if (isPomodoro) duration = (isBreak ? 300 : 1500) - time;
    if (duration < 60 && !confirm('Session is less than a minute. Save?')) return;
    
    const newSession = { id: Date.now().toString(), subjectId: activeSubject, chapterId: activeChapter, durationSeconds: duration, date: new Date().toISOString() };
    const updated = [...sessions, newSession];
    setSessions(updated);
    
    localStorage.setItem('study_sessions_' + currentCourse, JSON.stringify(updated));
    if (currentCourse === 'cbse') {
      localStorage.setItem('cbse_study_sessions', JSON.stringify(updated));
    }
    saveToCloud(syncId, updated, chapterProgress, chapterCompletions);
    
    setIsRunning(false); setIsBreak(false);
    if (!isPomodoro) setTime(0);
  };

  const handleProgressChange = (chapId, val) => {
    const p = parseInt(val);
    const updatedProg = { ...chapterProgress, [chapId]: p };
    setChapterProgress(updatedProg);
    
    localStorage.setItem('study_progress_' + currentCourse, JSON.stringify(updatedProg));
    if (currentCourse === 'cbse') {
      localStorage.setItem('cbse_chapter_progress', JSON.stringify(updatedProg));
    }

    let updatedComp = chapterCompletions;
    if (p === 100 && !chapterCompletions[chapId]) {
      updatedComp = { ...chapterCompletions, [chapId]: new Date().toISOString() };
      setChapterCompletions(updatedComp);
      localStorage.setItem('study_completions_' + currentCourse, JSON.stringify(updatedComp));
      if (currentCourse === 'cbse') {
        localStorage.setItem('cbse_chapter_completions', JSON.stringify(updatedComp));
      }
    }
    
    saveToCloud(syncId, sessions, updatedProg, updatedComp);
  };

  const toggleChapterComplete = (chapId) => {
    const cur = chapterProgress[chapId] || 0;
    handleProgressChange(chapId, cur === 100 ? 0 : 100);
  };

  const clearData = () => {
    const courseName = DEFAULT_COURSES[currentCourse]?.name || currentCourse;
    if (confirm(`Delete all tracking data for ${courseName}?`)) {
      setSessions([]); setChapterProgress({}); setChapterCompletions({});
      localStorage.removeItem('study_sessions_' + currentCourse);
      localStorage.removeItem('study_progress_' + currentCourse);
      localStorage.removeItem('study_completions_' + currentCourse);
      if (currentCourse === 'cbse') {
        localStorage.removeItem('cbse_study_sessions');
        localStorage.removeItem('cbse_chapter_progress');
        localStorage.removeItem('cbse_chapter_completions');
      }
      if (syncId) {
        saveToCloud(syncId, [], {}, {});
      }
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (!isPomodoro) {
      const h = Math.floor(seconds / 3600);
      if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const completedChaptersCount = Object.values(chapterProgress).filter(p => p === 100).length;
  
  const getRevisionsDue = () => {
    const due = [];
    const now = new Date();
    Object.keys(chapterCompletions).forEach(chapId => {
      const compDate = new Date(chapterCompletions[chapId]);
      const diffDays = Math.floor((now - compDate) / (1000 * 60 * 60 * 24));
      let title = "Unknown";
      subjects.forEach(s => s.chapters.forEach(c => { if (c.id === chapId) title = c.title; }));
      if (diffDays === 1 || diffDays === 3 || diffDays === 7) due.push({ id: chapId, title, days: diffDays });
    });
    return due;
  };
  const revisionsDue = getRevisionsDue();

  const getPrediction = () => {
    if (completedChaptersCount === 0) return { status: 'info', msg: "Complete some chapters to see prediction." };
    let firstDate = new Date();
    if (sessions.length > 0) {
      firstDate = new Date(sessions[0].date);
      sessions.forEach(s => { if (new Date(s.date) < firstDate) firstDate = new Date(s.date); });
    }
    const daysStudied = Math.max(1, Math.floor((new Date() - firstDate) / (1000 * 60 * 60 * 24)));
    const burnRatePerDay = completedChaptersCount / daysStudied;
    
    const targetDate = new Date(examDate);
    const daysRemaining = Math.max(0, Math.floor((targetDate - new Date()) / (1000 * 60 * 60 * 24)));
    const remainingChapters = totalChapters - completedChaptersCount;
    
    if (remainingChapters <= 0) return { status: 'success', msg: "Syllabus Completed! Revise now." };
    if (daysRemaining === 0) return { status: 'danger', msg: "Exam date has passed or is today!" };

    const requiredBurnRate = remainingChapters / daysRemaining;
    if (burnRatePerDay >= requiredBurnRate) return { status: 'success', msg: "You are on track to finish the syllabus before the exam! Keep it up." };
    else return { status: 'danger', msg: `Warning: At your pace, you will not finish. You need to complete ${(requiredBurnRate - burnRatePerDay).toFixed(2)} extra chapters per day.` };
  };
  const prediction = getPrediction();

  const currentSubObj = subjects.find(s => s.id === activeSubject) || subjects[0] || { id: '', name: 'Subject', color: '#3b82f6', books: [], chapters: [] };
  const totalStudyTime = sessions.reduce((acc, curr) => acc + curr.durationSeconds, 0);
  const todayStr = new Date().toLocaleDateString();
  const todayStudyTime = sessions.reduce((acc, curr) => {
    return new Date(curr.date).toLocaleDateString() === todayStr ? acc + curr.durationSeconds : acc;
  }, 0);

  const calculateSubjectProgress = (subjectObj) => {
    if (!subjectObj || subjectObj.chapters.length === 0) return 0;
    let totalPercent = 0;
    subjectObj.chapters.forEach(c => totalPercent += (chapterProgress[c.id] || 0));
    return Math.round(totalPercent / subjectObj.chapters.length);
  };
  const currentSubjectOverallProgress = calculateSubjectProgress(currentSubObj);

  // --- CHART DATA PREPARATION ---
  
  // 1. Pie Chart: Time per Subject
  const pieDataMap = {};
  sessions.forEach(s => {
    if (!pieDataMap[s.subjectId]) pieDataMap[s.subjectId] = 0;
    pieDataMap[s.subjectId] += s.durationSeconds;
  });
  const pieData = Object.keys(pieDataMap).map(subId => {
    const sub = subjects.find(s => s.id === subId);
    return { name: sub?.name || 'Unknown', value: pieDataMap[subId], color: sub?.color || '#fff' };
  }).filter(d => d.value > 0);

  // 2. Bar Chart: Chapters per Subject
  const barData = subjects.map(sub => {
    let completed = 0;
    sub.chapters.forEach(c => { if (chapterProgress[c.id] === 100) completed++; });
    return { name: sub.name, completed, total: sub.chapters.length, color: sub.color };
  });

  // 3. Heatmap Data (Last 60 Days)
  const heatmapData = [];
  const today = new Date();
  today.setHours(0,0,0,0);
  const dailyDurations = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    d.setHours(0,0,0,0);
    const key = d.getTime();
    if (!dailyDurations[key]) dailyDurations[key] = 0;
    dailyDurations[key] += s.durationSeconds;
  });
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.getTime();
    const duration = dailyDurations[key] || 0;
    let level = 0;
    if (duration > 0) level = 1;
    if (duration > 1800) level = 2; // >30 mins
    if (duration > 3600) level = 3; // >1 hour
    if (duration > 7200) level = 4; // >2 hours
    heatmapData.push({ date: d.toLocaleDateString(), duration, level });
  }

  if (isHostageClient) {
    const enterFullscreen = (e) => {
      e.preventDefault();
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(()=>{});
      }
    };
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 9999 }} onClick={enterFullscreen}>
      </div>
    );
  }

  return (
    <motion.div 
      className="bento-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {showEyeRest && (
        <div className="eye-overlay">
          <Eye size={80} className="mb-6 animate-bounce text-green-400"/>
          <h1 className="font-bold mb-4">20-20-20 Rule!</h1>
          <p className="text-xl">Look at something 20 feet away to protect your eyes.</p>
          <p className="mt-8 text-gray-500">Screen will unlock automatically...</p>
        </div>
      )}

      {/* TOP COURSE SWITCHER & HEADER BAR */}
      <motion.div 
        className="glass-panel bento-header"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      >
        <div className="bento-header-left">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
               style={{ background: currentCourse === 'cainter' ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'linear-gradient(135deg, #2563eb, #06b6d4)' }}>
            {currentCourse === 'cainter' ? <Briefcase size={20} className="text-white"/> : <GraduationCap size={20} className="text-white"/>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-0">Focus Tracker</h1>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{ 
                      background: currentCourse === 'cainter' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                      color: currentCourse === 'cainter' ? '#c4b5fd' : '#93c5fd',
                      border: `1px solid ${currentCourse === 'cainter' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`
                    }}>
                {DEFAULT_COURSES[currentCourse]?.shortName || currentCourse}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {currentCourse === 'cainter' ? 'Chartered Accountancy Intermediate' : 'CBSE Board Prep Suite'} • {subjects.length} Subjects • {totalChapters} Chapters
            </p>
          </div>
        </div>

        {/* COURSE SWITCHER BUTTONS */}
        <div className="course-switcher-pill">
          <button
            onClick={() => switchCourse('cbse')}
            className={`course-btn ${currentCourse === 'cbse' ? 'active-cbse' : ''}`}
          >
            <GraduationCap size={15} />
            <span>CBSE Class 10</span>
          </button>
          <button
            onClick={() => switchCourse('cainter')}
            className={`course-btn ${currentCourse === 'cainter' ? 'active-ca' : ''}`}
          >
            <Briefcase size={15} />
            <span>CA Intermediate</span>
          </button>
        </div>
      </motion.div>

      {/* LEFT PANEL / TIMER TILE */}
      <motion.div className={`glass-panel bento-timer flex-col justify-center relative transition-all duration-500 ${isSlouching ? 'blur-md grayscale' : ''}`}
        whileHover={{ scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        {isSlouching && !showEyeRest && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 rounded-[24px]">
            <AlertTriangle size={64} className="text-orange-500 mb-4 animate-pulse"/>
            <h2 className="text-2xl font-bold text-white">POSTURE WARNING</h2>
            <p className="text-white/80">Sit back! You are too close to the screen.</p>
          </div>
        )}

        {focusWarning && (
          <div className="absolute top-4 left-4 right-4 bg-red-500/20 border border-red-500 text-red-500 p-3 rounded-md text-center text-sm font-bold flex items-center justify-center gap-2 z-10">
            <AlertTriangle size={16} /> Face Lost! Timer Paused.
          </div>
        )}

        {phoneHiddenWarning && (
          <div className="absolute top-16 left-4 right-4 bg-red-900/40 border border-red-500 text-red-300 p-3 rounded-md text-center text-sm font-bold flex flex-col items-center justify-center gap-2 z-10">
            <div className="flex items-center"><AlertTriangle size={16} className="mr-2"/> PHONE UNLOCKED! Timer Paused.</div>
            <p className="text-xs font-normal">Re-open the tracker tab on your phone to resume.</p>
          </div>
        )}

        <div className="text-center mb-4 sm:mb-6">
          <h2 className="mb-2 text-xl sm:text-2xl font-extrabold tracking-tight">Focus Timer</h2>
          <div className="flex justify-center gap-2 mt-3">
            <button className={`text-xs py-1.5 px-4 rounded-full font-semibold transition-all ${!isPomodoro ? 'bg-white text-slate-900 shadow-md' : 'bg-transparent text-slate-400 border border-white/20 hover:text-white'}`} onClick={() => setIsPomodoro(false)}>Stopwatch</button>
            <button className={`text-xs py-1.5 px-4 rounded-full font-semibold transition-all ${isPomodoro ? 'bg-white text-slate-900 shadow-md' : 'bg-transparent text-slate-400 border border-white/20 hover:text-white'}`} onClick={() => setIsPomodoro(true)}>Pomodoro</button>
          </div>
        </div>

        <div className="flex flex-col items-center mb-6 sm:mb-8 w-full">
          <div className="w-full max-w-[320px] mb-5 flex flex-col gap-2.5">
            <select value={activeSubject} onChange={(e) => setActiveSubject(e.target.value)} disabled={isRunning} className="w-full text-xs sm:text-sm rounded-xl p-2.5 bg-slate-800/80 border border-slate-700 text-white outline-none hover:border-slate-600 transition-colors">
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={activeChapter} onChange={(e) => setActiveChapter(e.target.value)} disabled={isRunning} className="w-full text-xs sm:text-sm rounded-xl p-2.5 bg-slate-800/80 border border-slate-700 text-white outline-none hover:border-slate-600 transition-colors">
              {currentSubObj.books.map(book => (
                <optgroup key={book.name} label={book.name}>
                  {book.chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="text-center mb-6 flex flex-wrap justify-center gap-2.5 sm:gap-4 w-full">
            <button 
              className="text-xs flex items-center justify-center rounded-full border-0 bg-white/5 hover:bg-white/10 transition-colors py-2 px-3 sm:px-4" 
              style={{ color: isFaceTrackingEnabled ? '#10b981' : '#94a3b8' }}
              onClick={() => setIsFaceTrackingEnabled(!isFaceTrackingEnabled)}
            >
              {isFaceTrackingEnabled ? <Eye size={14} className="mr-1.5"/> : <EyeOff size={14} className="mr-1.5"/>}
              AI Focus
            </button>
            <button 
              className="text-xs flex items-center justify-center rounded-full border-0 bg-white/5 hover:bg-white/10 transition-colors py-2 px-3 sm:px-4" 
              style={{ color: isHostageMode ? '#ef4444' : '#94a3b8' }}
              onClick={() => setIsHostageMode(!isHostageMode)}
              disabled={isRunning}
            >
              <Smartphone size={14} className="mr-1.5"/>
              Hostage Mode
            </button>
          </div>

          {isHostageMode && !isPhoneConnected && hostageSessionId ? (
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
               className="flex flex-col items-center justify-center mb-6 bg-slate-900/60 p-4 rounded-2xl border border-red-500/30 h-[230px] w-full max-w-[250px] mx-auto"
             >
               <p className="text-xs text-red-400 mb-3 text-center font-medium leading-tight">Scan to lock your phone<br/>and start timer.</p>
               <div className="p-2 bg-white rounded-xl shadow-lg">
                 <QRCodeSVG value={`${window.location.origin}/?hostage=${hostageSessionId}`} size={120} />
               </div>
             </motion.div>
          ) : (
            <motion.div 
              className={`timer-circle ${isRunning ? 'active' : ''}`}
              style={{ '--current-color': isBreak ? '#10b981' : currentSubObj.color }}
              animate={{ scale: isRunning ? 1.02 : 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
            >
              {isBreak && <span className="absolute top-6 sm:top-8 text-xs sm:text-sm font-extrabold tracking-widest text-[#10b981]">BREAK</span>}
              <span className="timer-time font-outfit">{formatTime(time)}</span>
            </motion.div>
          )}

          <div className="flex justify-center gap-3 mt-4 w-full max-w-[320px] mx-auto">
            <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold transition-all ${isRunning ? "bg-white/10 text-white border border-white/20" : "primary"}`} onClick={toggleTimer}>
              {isRunning ? <Pause size={18} /> : <Play size={18} />}
              <span>{isRunning ? 'Pause' : 'Start Focus'}</span>
            </button>
            {((!isPomodoro && time > 0) || (isPomodoro && time < 1500 && !isBreak) || isBreak) && (
              <button className="danger flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold" onClick={finishSession}><Square size={16} /> Finish</button>
            )}
          </div>
        </div>

        {isFaceTrackingEnabled && isRunning && !isBreak && (
          <div className="absolute bottom-4 right-4 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-2 border-white/10 opacity-40 z-0 shadow-lg">
             <Webcam audio={false} ref={webcamRef} className="w-full h-full object-cover" />
          </div>
        )}
      </motion.div>

      {/* TABS TILE */}
      <motion.div className="bento-tabs flex gap-2 w-full"
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
      >
        <button className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><BarChart3 size={16} className="inline mr-1.5" /> Analytics</button>
        <button className={`tab ${activeTab === 'syllabus' ? 'active' : ''}`} onClick={() => setActiveTab('syllabus')}><List size={16} className="inline mr-1.5" /> Syllabus & Chapters</button>
      </motion.div>

      {/* RIGHT PANEL CONTENT */}
      {activeTab === 'stats' && (
        <>
          <div className="bento-stats-row">
            <motion.div className="glass-panel bento-chart-1"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
            >
               <p className="stat-label"><Clock size={16}/> Today's Focus</p>
               <h3 className="stat-value text-blue-400">{formatTime(todayStudyTime)}</h3>
            </motion.div>
            
            <motion.div className="glass-panel bento-chart-2"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            >
               <p className="stat-label"><Target size={16}/> Total Focus</p>
               <h3 className="stat-value text-green-400">{formatTime(totalStudyTime)}</h3>
            </motion.div>
          </div>

          <motion.div className="glass-panel bento-chart-wide flex flex-col"
             initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          >
            <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
               <h3 className="text-base sm:text-lg font-bold text-white">60-Day Heatmap</h3>
               <span className="text-xs text-slate-400">Study Consistency</span>
            </div>
            <div className="heatmap-grid overflow-x-auto pb-2">
              {heatmapData.map((d, i) => (
                <div key={i} className={`heatmap-cell level-${d.level}`} title={`${d.date}: ${formatTime(d.duration)}`} />
              ))}
            </div>

            {pieData.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <h3 className="text-base sm:text-lg font-bold text-white mb-3">Time Distribution</h3>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4}>
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(val) => formatTime(val)} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} itemStyle={{color: '#fff'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            
            <div className="mt-6 pt-5 border-t border-white/5">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center"><BrainCircuit size={18} className="mr-2 text-blue-400 flex-shrink-0"/> Exam Prediction</h3>
                <input 
                  type="date" 
                  value={examDate} 
                  onChange={e => {
                    setExamDate(e.target.value); 
                    localStorage.setItem('study_exam_date_' + currentCourse, e.target.value);
                    if (currentCourse === 'cbse') localStorage.setItem('cbse_exam_date', e.target.value);
                  }} 
                  className="text-xs sm:text-sm p-2 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none w-full sm:w-auto" 
                />
              </div>
              <p className={`text-xs sm:text-sm flex items-center p-3 sm:p-4 rounded-xl font-medium leading-relaxed ${prediction.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : prediction.status === 'danger' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-300'}`}>
                {prediction.status === 'success' && <CheckCircle2 size={16} className="mr-2 flex-shrink-0"/>}
                {prediction.status === 'danger' && <AlertTriangle size={16} className="mr-2 flex-shrink-0"/>}
                <span>{prediction.msg}</span>
              </p>
            </div>
            
            {revisionsDue.length > 0 && (
              <div className="mt-5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10">
                <h3 className="flex items-center text-sm sm:text-base mb-2.5 text-amber-400 font-bold"><BrainCircuit size={16} className="mr-1.5 flex-shrink-0"/> SRS Revisions Due Today</h3>
                <ul className="text-xs sm:text-sm space-y-2">
                  {revisionsDue.map((rev, i) => (
                    <li key={i} className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg">
                      <span className="font-medium truncate mr-2">{rev.title}</span>
                      <span className="text-[11px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md whitespace-nowrap">{rev.days} days ago</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </>
      )}

      {activeTab === 'syllabus' && (
        <motion.div className="glass-panel bento-syllabus flex-col"
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          {/* HEADER WITH EDIT TOGGLE */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 pb-4 border-b border-white/5 w-full">
            <div>
              <h2 className="text-lg sm:text-xl font-bold mb-1 flex items-center gap-2 flex-wrap">
                <span>{DEFAULT_COURSES[currentCourse]?.name || currentCourse} Syllabus</span>
                {isEditingSyllabus && <span className="edit-mode-badge"><Edit2 size={12}/> Editing Mode</span>}
              </h2>
              <p className="text-xs text-slate-400">
                {isEditingSyllabus ? 'Add your own custom topics, rename chapters, or add modules below.' : 'Track completion or customize chapters for your syllabus.'}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              {isEditingSyllabus ? (
                <>
                  <button 
                    onClick={handleResetSyllabus} 
                    className="text-xs py-1.5 px-3 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5"
                    title="Restore standard official syllabus"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                  <button 
                    onClick={() => setIsAddingSubject(true)} 
                    className="text-xs py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Subject
                  </button>
                  <button 
                    onClick={() => setIsEditingSyllabus(false)} 
                    className="text-xs py-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                  >
                    <Check size={14} /> Done
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setIsEditingSyllabus(true)} 
                  className="text-xs py-2 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center gap-2 border border-white/10 shadow-sm"
                >
                  <Edit2 size={14} className="text-amber-400" />
                  Customize Syllabus
                </button>
              )}
            </div>
          </div>

          {/* EDIT MODE ACTIVE BANNER */}
          {isEditingSyllabus && (
            <div className="p-3.5 sm:p-4 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-300">Customizer Active</h4>
                  <p className="text-xs text-amber-300/80">Add custom topics to any module or delete chapters. All changes are saved instantly!</p>
                </div>
              </div>
            </div>
          )}

          {/* ADD SUBJECT FORM DRAWER */}
          {isAddingSubject && (
            <div className="p-4 sm:p-5 mb-5 rounded-2xl bg-slate-800/90 border border-blue-500/40 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus size={16} className="text-blue-400" /> Add New Subject to {DEFAULT_COURSES[currentCourse]?.shortName}
                </h3>
                <button onClick={() => setIsAddingSubject(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Subject Name (e.g., Information Technology, Economics...)"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="text-sm p-3 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-slate-400">Theme Color:</span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewSubjectColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform"
                      style={{ backgroundColor: c, borderColor: newSubjectColor === c ? '#fff' : 'transparent', transform: newSubjectColor === c ? 'scale(1.2)' : 'scale(1)' }}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setIsAddingSubject(false)} className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white">Cancel</button>
                  <button onClick={handleAddSubject} className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md">Create Subject</button>
                </div>
              </div>
            </div>
          )}

          {/* SUBJECTS HORIZONTAL NAV PILLS */}
          <div className="subject-nav-scroll mb-5">
            {subjects.map(s => {
              const prog = calculateSubjectProgress(s);
              const isActive = s.id === activeSubject;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSubject(s.id)}
                  className={`subject-chip ${isActive ? 'active' : ''}`}
                  style={{ borderColor: isActive ? s.color : 'rgba(255,255,255,0.08)' }}
                >
                  <span className="color-dot" style={{ backgroundColor: s.color }} />
                  <span>{s.name}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${s.color}25`, color: s.color }}>
                    {prog}%
                  </span>
                </button>
              );
            })}
          </div>
          
          {/* ACTIVE SUBJECT OVERVIEW CARD */}
          <div className="mb-5 p-4 sm:p-6 rounded-2xl bg-slate-800/50 border border-white/5">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: currentSubObj.color }} />
                <span className="font-bold text-lg text-white">{currentSubObj.name} Overall</span>
                {isEditingSyllabus && subjects.length > 1 && (
                  <button
                    onClick={() => handleDeleteSubject(currentSubObj.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10"
                    title="Delete this entire subject"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-lg" style={{ color: currentSubObj.color }}>{currentSubjectOverallProgress}%</span>
                {isEditingSyllabus && (
                  <button
                    onClick={() => setAddingBookSubId(currentSubObj.id)}
                    className="text-xs py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center gap-1 border border-white/10"
                  >
                    <FolderPlus size={14} /> Add Module
                  </button>
                )}
              </div>
            </div>
            <div className="progress-bg h-3.5 rounded-full bg-slate-900/60 overflow-hidden">
              <div className="progress-fill h-full rounded-full transition-all duration-500" style={{ width: `${currentSubjectOverallProgress}%`, backgroundColor: currentSubObj.color }}></div>
            </div>
          </div>

          {/* ADD MODULE INLINE FORM */}
          {addingBookSubId === currentSubObj.id && (
            <div className="p-4 mb-6 rounded-2xl bg-slate-800/80 border border-white/10">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">New Module / Section Name</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Module 2: Corporate Accounts"
                  value={newBookName}
                  onChange={(e) => setNewBookName(e.target.value)}
                  className="flex-1 text-sm bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                  autoFocus
                />
                <button onClick={() => setAddingBookSubId(null)} className="text-xs px-3 py-2 text-slate-400 hover:text-white">Cancel</button>
                <button onClick={() => handleAddBook(currentSubObj.id)} className="text-xs px-4 py-2 rounded-xl bg-blue-600 text-white font-bold">Add</button>
              </div>
            </div>
          )}

          {/* BOOKS / MODULES & CHAPTERS LIST */}
          <div className="flex flex-col gap-6">
            {currentSubObj.books.length === 0 && (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl text-slate-400">
                <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No modules in this subject yet.</p>
                {isEditingSyllabus && (
                  <button onClick={() => setAddingBookSubId(currentSubObj.id)} className="mt-3 text-xs py-1.5 px-3 bg-blue-600 text-white font-bold rounded-lg inline-flex items-center gap-1">
                    <Plus size={14} /> Add First Module
                  </button>
                )}
              </div>
            )}

            {currentSubObj.books.map((book, bookIdx) => (
              <div key={bookIdx} className="module-card">
                {/* MODULE HEADER */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                  {editingBookKey === `${currentSubObj.id}_${bookIdx}` ? (
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <input
                        type="text"
                        value={editingBookName}
                        onChange={(e) => setEditingBookName(e.target.value)}
                        className="text-xs font-bold bg-slate-900 border border-blue-500 rounded px-2 py-1 text-white flex-1 outline-none"
                        autoFocus
                      />
                      <button onClick={() => handleSaveEditBook(currentSubObj.id, bookIdx)} className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"><Check size={14}/></button>
                      <button onClick={() => setEditingBookKey(null)} className="p-1 text-slate-400 hover:bg-white/10 rounded"><X size={14}/></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">{book.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold">{book.chapters.length} topics</span>
                      {isEditingSyllabus && (
                        <button onClick={() => { setEditingBookKey(`${currentSubObj.id}_${bookIdx}`); setEditingBookName(book.name); }} className="text-slate-500 hover:text-white p-1">
                          <Edit2 size={12}/>
                        </button>
                      )}
                    </div>
                  )}

                  {isEditingSyllabus && currentSubObj.books.length > 1 && (
                    <button onClick={() => handleDeleteBook(currentSubObj.id, bookIdx)} className="text-slate-500 hover:text-rose-400 p-1" title="Delete module">
                      <Trash2 size={14}/>
                    </button>
                  )}
                </div>

                {/* INLINE ADD CHAPTER FORM (WHEN EDIT MODE ACTIVE) */}
                {isEditingSyllabus && (
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleAddChapter(currentSubObj.id, bookIdx); }}
                    className="flex gap-2 mb-4"
                  >
                    <input
                      type="text"
                      placeholder={`+ Add new chapter/topic to ${book.name}...`}
                      value={newChapterTitles[`${currentSubObj.id}_${bookIdx}`] || ''}
                      onChange={(e) => setNewChapterTitles(prev => ({ ...prev, [`${currentSubObj.id}_${bookIdx}`]: e.target.value }))}
                      className="flex-1 text-xs bg-slate-900/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 outline-none focus:border-blue-500"
                    />
                    <button type="submit" className="text-xs font-bold px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 shadow">
                      <Plus size={14}/> Add
                    </button>
                  </form>
                )}

                {/* CHAPTERS LIST */}
                {book.chapters.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No chapters in this module yet. Use the "+ Add" input above.</p>
                ) : (
                  book.chapters.map(chapter => {
                    const prog = chapterProgress[chapter.id] || 0;
                    const isDone = prog === 100;
                    const isEditingThis = editingChapId === chapter.id;

                    return (
                      <div key={chapter.id} className="chapter-row">
                        {isEditingThis ? (
                          <div className="flex items-center gap-2 py-1">
                            <input
                              type="text"
                              value={editingChapTitle}
                              onChange={(e) => setEditingChapTitle(e.target.value)}
                              className="flex-1 text-sm bg-slate-900 border border-blue-500 rounded-lg px-3 py-1.5 text-white outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditChapter(currentSubObj.id, bookIdx, chapter.id);
                                if (e.key === 'Escape') setEditingChapId(null);
                              }}
                            />
                            <button onClick={() => handleSaveEditChapter(currentSubObj.id, bookIdx, chapter.id)} className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500">
                              <Check size={14}/>
                            </button>
                            <button onClick={() => setEditingChapId(null)} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                              <X size={14}/>
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                {isDone && <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />}
                                {chapter.title}
                              </span>
                              
                              <div className="flex items-center gap-2">
                                {isEditingSyllabus ? (
                                  <>
                                    <button 
                                      onClick={() => handleStartEditChapter(chapter)} 
                                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                      title="Rename topic"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteChapter(currentSubObj.id, bookIdx, chapter.id)} 
                                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                      title="Delete topic"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => toggleChapterComplete(chapter.id)}
                                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all ${isDone ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'}`}
                                      title={isDone ? 'Click to unmark complete' : 'One-click mark 100% complete'}
                                    >
                                      {isDone ? '100% Done' : 'Mark Done'}
                                    </button>
                                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${currentSubObj.color}20`, color: currentSubObj.color }}>
                                      {prog}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* PROGRESS SLIDER (ONLY IN STUDY MODE) */}
                            {!isEditingSyllabus && (
                              <input 
                                type="range" 
                                className="custom-slider w-full mt-1" 
                                min="0" 
                                max="100" 
                                value={prog} 
                                onChange={(e) => handleProgressChange(chapter.id, e.target.value)} 
                                style={{ 
                                  '--current-color': currentSubObj.color, 
                                  '--slider-bg': `linear-gradient(to right, ${currentSubObj.color} ${prog}%, rgba(255,255,255,0.08) ${prog}%)` 
                                }} 
                              />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* BOTTOM CONTROL BAR */}
      <motion.div className="bento-footer mt-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center border-t border-white/5 pt-4 gap-3 w-full"
         initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      >
         <button onClick={linkDevice} className="text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center font-medium w-full sm:w-auto" style={{ background: syncId ? '#10b98120' : 'rgba(255,255,255,0.05)', border: syncId ? '1px solid #10b98150' : '1px solid transparent' }}>
           {syncId ? <Cloud size={16} className="mr-2 text-emerald-400 flex-shrink-0" /> : <CloudOff size={16} className="mr-2 text-slate-400 flex-shrink-0" />}
           <span className="truncate">{syncId ? `Synced: ${syncId}` : 'Link Cloud Device'}</span>
           {isSyncing && <span className="ml-1 text-xs opacity-50">(syncing)</span>}
         </button>
         <button onClick={clearData} className="danger rounded-xl flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs sm:text-sm w-full sm:w-auto">
           <Trash2 size={15} className="flex-shrink-0" />
           <span>Reset Course Data</span>
         </button>
      </motion.div>

    </motion.div>
  );
}

