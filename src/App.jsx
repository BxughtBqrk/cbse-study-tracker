import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, BarChart3, Clock, BookOpen, Trash2, List, Upload, Download, BrainCircuit, Target, AlertTriangle, CheckCircle2, Eye, EyeOff, Cloud, CloudOff, Smartphone } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import Webcam from "react-webcam";
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { SYLLABUS } from './syllabusData';
import { supabase } from './supabaseClient';
import './index.css';

const SUBJECTS = Object.keys(SYLLABUS).map(key => ({
  id: key, 
  name: SYLLABUS[key].name, 
  color: SYLLABUS[key].color, 
  books: SYLLABUS[key].books,
  chapters: SYLLABUS[key].books.flatMap(b => b.chapters)
}));

const TOTAL_CHAPTERS = SUBJECTS.reduce((acc, sub) => acc + sub.chapters.length, 0);

export default function App() {
  const [activeTab, setActiveTab] = useState('stats');
  
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSubject, setActiveSubject] = useState(SUBJECTS[0].id);
  const [activeChapter, setActiveChapter] = useState(SUBJECTS[0].chapters[0].id);
  
  const [isPomodoro, setIsPomodoro] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [examDate, setExamDate] = useState('2027-02-15');
  
  const [isFaceTrackingEnabled, setIsFaceTrackingEnabled] = useState(false);
  const [model, setModel] = useState(null);
  const [focusWarning, setFocusWarning] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [chapterProgress, setChapterProgress] = useState({});
  const [chapterCompletions, setChapterCompletions] = useState({}); 

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

  // INITIAL LOAD
  useEffect(() => {
    const s = localStorage.getItem('cbse_study_sessions');
    if (s) try { setSessions(JSON.parse(s)); } catch(e){}
    const p = localStorage.getItem('cbse_chapter_progress');
    if (p) try { setChapterProgress(JSON.parse(p)); } catch(e){}
    const c = localStorage.getItem('cbse_chapter_completions');
    if (c) try { setChapterCompletions(JSON.parse(c)); } catch(e){}
    const ed = localStorage.getItem('cbse_exam_date');
    if (ed) setExamDate(ed);
    
    const sid = localStorage.getItem('cbse_sync_id');
    if (sid) {
      setSyncId(sid);
      fetchFromCloud(sid);
    }
  }, []);

  const fetchFromCloud = async (id) => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.from('user_stats').select('*').eq('sync_id', id).single();
      if (data) {
        setSessions(data.sessions || []);
        setChapterProgress(data.progress || {});
        setChapterCompletions(data.completions || {});
        localStorage.setItem('cbse_study_sessions', JSON.stringify(data.sessions || []));
        localStorage.setItem('cbse_chapter_progress', JSON.stringify(data.progress || {}));
        localStorage.setItem('cbse_chapter_completions', JSON.stringify(data.completions || {}));
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
      await supabase.from('user_stats').upsert({
        sync_id: idToUse,
        sessions: s,
        progress: p,
        completions: c,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sync_id' });
    } catch(e) { console.error("Save error", e); }
    setIsSyncing(false);
  };

  const linkDevice = async () => {
    let newId = prompt("Enter a unique Sync ID (e.g. aryan2027). Use the same ID on all devices to sync automatically:");
    if (!newId) return;
    newId = newId.trim().toLowerCase(); // FIX: Prevent mobile auto-capitalization from breaking sync
    
    setSyncId(newId);
    localStorage.setItem('cbse_sync_id', newId);
    await fetchFromCloud(newId);
    // If empty in cloud but we have local, push it immediately
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
    const sub = SUBJECTS.find(s => s.id === activeSubject);
    if (sub && sub.chapters.length > 0) {
      const exists = sub.chapters.some(c => c.id === activeChapter);
      if (!exists) setActiveChapter(sub.chapters[0].id);
    }
  }, [activeSubject]);

  // Mobile Client Hostage Logic
  const isHostageClient = window.location.search.includes('hostage=');
  const hostageClientId = new URLSearchParams(window.location.search).get('hostage');
  
  useEffect(() => {
    if (isHostageClient && hostageClientId) {
      const channel = supabase.channel(`hostage_${hostageClientId}`, {
        config: { presence: { key: 'phone' } }
      });
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online: true });
          channel.send({ type: 'broadcast', event: 'status', payload: { connected: true, visible: true } });
        }
      });
      const handleVisibility = () => {
        channel.send({ type: 'broadcast', event: 'status', payload: { connected: true, visible: document.visibilityState === 'visible' } });
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        channel.untrack();
      }
    }
  }, [isHostageClient, hostageClientId]);

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
              playAlertSound();
            }
          });
          channel.on('broadcast', { event: 'status' }, (payload) => {
            if (payload.payload.visible) {
              setIsPhoneConnected(true);
              setPhoneHiddenWarning(false);
              setIsRunning(true);
            } else {
              setPhoneHiddenWarning(true);
              setIsRunning(false);
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
    localStorage.setItem('cbse_study_sessions', JSON.stringify(updated));
    saveToCloud(syncId, updated, chapterProgress, chapterCompletions);
    
    setIsRunning(false); setIsBreak(false);
    if (!isPomodoro) setTime(0);
  };

  const handleProgressChange = (chapId, val) => {
    const p = parseInt(val);
    const updatedProg = { ...chapterProgress, [chapId]: p };
    setChapterProgress(updatedProg);
    localStorage.setItem('cbse_chapter_progress', JSON.stringify(updatedProg));

    let updatedComp = chapterCompletions;
    if (p === 100 && !chapterCompletions[chapId]) {
      updatedComp = { ...chapterCompletions, [chapId]: new Date().toISOString() };
      setChapterCompletions(updatedComp);
      localStorage.setItem('cbse_chapter_completions', JSON.stringify(updatedComp));
    }
    
    saveToCloud(syncId, sessions, updatedProg, updatedComp);
  };

  const clearData = () => {
    if (confirm('Delete all data?')) {
      setSessions([]); setChapterProgress({}); setChapterCompletions({});
      setSyncId('');
      localStorage.clear();
      if(syncId) {
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
      SUBJECTS.forEach(s => s.chapters.forEach(c => { if (c.id === chapId) title = c.title; }));
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
    const remainingChapters = TOTAL_CHAPTERS - completedChaptersCount;
    
    if (remainingChapters === 0) return { status: 'success', msg: "Syllabus Completed! Revise now." };
    if (daysRemaining === 0) return { status: 'danger', msg: "Exam date has passed or is today!" };

    const requiredBurnRate = remainingChapters / daysRemaining;
    if (burnRatePerDay >= requiredBurnRate) return { status: 'success', msg: "You are on track to finish the syllabus before the exam! Keep it up." };
    else return { status: 'danger', msg: `Warning: At your pace, you will not finish. You need to complete ${(requiredBurnRate - burnRatePerDay).toFixed(2)} extra chapters per day.` };
  };
  const prediction = getPrediction();

  const currentSubObj = SUBJECTS.find(s => s.id === activeSubject);
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
    const sub = SUBJECTS.find(s => s.id === subId);
    return { name: sub?.name || 'Unknown', value: pieDataMap[subId], color: sub?.color || '#fff' };
  }).filter(d => d.value > 0);

  // 2. Bar Chart: Chapters per Subject
  const barData = SUBJECTS.map(sub => {
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
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-900 text-white text-center p-8">
        <AlertTriangle size={64} className="mb-6 animate-pulse"/>
        <h1 className="text-3xl font-bold mb-4">PHONE LOCKED</h1>
        <p className="text-xl">Do not close this tab or turn off your screen.</p>
        <p className="mt-8 opacity-70">If you leave this page, your desktop timer will pause and an alarm will sound.</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {showEyeRest && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white">
          <Eye size={80} className="mb-6 animate-bounce text-green-400"/>
          <h1 className="text-4xl font-bold mb-4">20-20-20 Rule!</h1>
          <p className="text-xl">Look at something 20 feet away to protect your eyes.</p>
          <p className="mt-8 text-gray-500">Screen will unlock automatically...</p>
        </div>
      )}

      {/* LEFT PANEL */}
      <div className={`glass-panel flex-col justify-center relative transition-all duration-500 ${isSlouching ? 'blur-md grayscale' : ''}`}>
        
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

        <div className="text-center mb-6">
          <h1 className="mb-2">Focus Tracker</h1>
          <div className="flex justify-center gap-2">
            <button className={`text-xs py-1 px-3 ${!isPomodoro ? 'bg-white text-black' : 'bg-transparent border border-white/20'}`} onClick={() => setIsPomodoro(false)}>Stopwatch</button>
            <button className={`text-xs py-1 px-3 ${isPomodoro ? 'bg-white text-black' : 'bg-transparent border border-white/20'}`} onClick={() => setIsPomodoro(true)}>Pomodoro</button>
          </div>
        </div>

        <div className="flex-col items-center mb-8">
          <div className="w-full max-w-[280px] mb-6">
            <select value={activeSubject} onChange={(e) => setActiveSubject(e.target.value)} disabled={isRunning} className="w-full mb-3 text-sm">
              {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={activeChapter} onChange={(e) => setActiveChapter(e.target.value)} disabled={isRunning} className="w-full text-sm">
              {currentSubObj.books.map(book => (
                <optgroup key={book.name} label={book.name}>
                  {book.chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="text-center mb-4 flex justify-center gap-4">
            <button 
              className="text-xs flex items-center justify-center" 
              style={{ background: 'transparent', color: isFaceTrackingEnabled ? '#10b981' : '#a1a1aa' }}
              onClick={() => setIsFaceTrackingEnabled(!isFaceTrackingEnabled)}
            >
              {isFaceTrackingEnabled ? <Eye size={14} className="mr-1"/> : <EyeOff size={14} className="mr-1"/>}
              {isFaceTrackingEnabled ? 'Focus Tracking ON' : 'Focus Tracking OFF'}
            </button>
            <button 
              className="text-xs flex items-center justify-center" 
              style={{ background: 'transparent', color: isHostageMode ? '#ef4444' : '#a1a1aa' }}
              onClick={() => setIsHostageMode(!isHostageMode)}
              disabled={isRunning}
            >
              <Smartphone size={14} className="mr-1"/>
              {isHostageMode ? 'Hostage Mode ON' : 'Hostage Mode OFF'}
            </button>
          </div>

          {isHostageMode && !isPhoneConnected && hostageSessionId ? (
             <div className="flex flex-col items-center justify-center mb-8 bg-black/40 p-4 rounded-xl border border-red-500/30 h-[250px] w-[250px] mx-auto">
               <p className="text-xs text-red-400 mb-3 text-center leading-tight">Scan to lock your phone<br/>and start timer.</p>
               <div className="p-2 bg-white rounded-lg">
                 <QRCodeSVG value={`${window.location.origin}/?hostage=${hostageSessionId}`} size={120} />
               </div>
             </div>
          ) : (
            <div 
              className={`timer-circle ${isRunning ? 'active' : ''}`}
              style={{ '--current-color': isBreak ? '#10b981' : currentSubObj.color }}
            >
              {isBreak && <span className="absolute top-8 text-sm font-bold tracking-widest text-[#10b981]">BREAK</span>}
              <span className="timer-time">{formatTime(time)}</span>
            </div>
          )}

          <div className="flex gap-4">
            <button className={isRunning ? "" : "primary"} onClick={toggleTimer}>
              {isRunning ? <Pause size={20} /> : <Play size={20} />}
              {isRunning ? 'Pause' : 'Start Focus'}
            </button>
            {((!isPomodoro && time > 0) || (isPomodoro && time < 1500 && !isBreak) || isBreak) && (
              <button className="danger" onClick={finishSession}><Square size={20} /> Finish</button>
            )}
          </div>
        </div>

        {isFaceTrackingEnabled && isRunning && !isBreak && (
          <div className="absolute bottom-4 right-4 w-24 h-24 rounded-lg overflow-hidden border-2 border-white/10 opacity-50 z-0">
             <Webcam audio={false} ref={webcamRef} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="glass-panel flex-col" style={{ overflowY: 'auto' }}>
        <div className="tabs">
          <button className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><BarChart3 size={18} className="inline mr-2" /> Analytics</button>
          <button className={`tab ${activeTab === 'syllabus' ? 'active' : ''}`} onClick={() => setActiveTab('syllabus')}><List size={18} className="inline mr-2" /> Syllabus</button>
        </div>

        {activeTab === 'stats' && (
          <div className="flex-col gap-6">
            <div className="flex gap-4 mb-2">
              <div className="flex-1 bg-black/20 border border-white/5 p-4 rounded-lg">
                <p className="text-sm text-white/60 mb-1 flex items-center"><Clock size={14} className="mr-2"/> Today's Focus</p>
                <h3 className="text-2xl font-bold text-blue-400">{formatTime(todayStudyTime)}</h3>
              </div>
              <div className="flex-1 bg-black/20 border border-white/5 p-4 rounded-lg">
                <p className="text-sm text-white/60 mb-1 flex items-center"><Clock size={14} className="mr-2"/> Total Focus</p>
                <h3 className="text-2xl font-bold text-green-400">{formatTime(totalStudyTime)}</h3>
              </div>
            </div>
            
            {/* Heatmap */}
            <div className="chart-container" style={{ marginTop: 0 }}>
              <h3 className="text-sm font-semibold text-white/80 mb-3">Study Heatmap (Last 60 Days)</h3>
              <div className="heatmap-grid">
                {heatmapData.map((d, i) => (
                  <div key={i} className={`heatmap-cell level-${d.level}`} title={`${d.date}: ${formatTime(d.duration)}`} />
                ))}
              </div>
            </div>

            {/* Charts Row */}
            {pieData.length > 0 && (
              <div className="chart-container flex-col items-center">
                <h3 className="text-sm font-semibold text-white/80 mb-3 w-full">Time Distribution</h3>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(val) => formatTime(val)} contentStyle={{ backgroundColor: '#1e222d', border: '1px solid #333' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="chart-container flex-col">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Chapter Velocity</h3>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} interval={0} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e222d', border: '1px solid #333' }} />
                    <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total Chapters" fill="#a1a1aa" opacity={0.2} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Old Stats Layout */}
            <div className="p-5 rounded-lg border border-white/5 bg-black/20 mt-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="flex items-center text-base"><Target size={18} className="mr-2 text-blue-400"/> Exam Prediction</h3>
                <input type="date" value={examDate} onChange={e => {setExamDate(e.target.value); localStorage.setItem('cbse_exam_date', e.target.value);}} className="text-sm p-1 py-1" />
              </div>
              <p className={`text-sm flex items-center p-3 rounded-md ${prediction.status === 'success' ? 'bg-green-500/10 text-green-400' : prediction.status === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-white/5'}`}>
                {prediction.status === 'success' && <CheckCircle2 size={16} className="mr-2"/>}
                {prediction.status === 'danger' && <AlertTriangle size={16} className="mr-2"/>}
                {prediction.msg}
              </p>
              <div className="mt-4 text-sm text-muted">Syllabus Completion: {completedChaptersCount} / {TOTAL_CHAPTERS} Chapters</div>
            </div>

            {revisionsDue.length > 0 && (
              <div className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5 mt-4">
                <h3 className="flex items-center text-base mb-3 text-orange-400"><BrainCircuit size={18} className="mr-2"/> SRS Revisions Due Today</h3>
                <ul className="text-sm space-y-2">
                  {revisionsDue.map((rev, i) => (
                    <li key={i} className="flex justify-between items-center bg-black/20 p-2 rounded">
                      <span>{rev.title}</span>
                      <span className="text-xs text-orange-300">Completed {rev.days} day(s) ago</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'syllabus' && (
          <div className="flex-col">
            <h2 className="mb-6 text-lg">Track Syllabus</h2>
            
            <div className="mb-8 p-4 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.2)', border: `1px solid ${currentSubObj.color}40` }}>
              <div className="flex justify-between mb-2">
                <span className="font-medium">{currentSubObj.name} Overall</span>
                <span className="font-bold" style={{ color: currentSubObj.color }}>{currentSubjectOverallProgress}%</span>
              </div>
              <div className="progress-bg">
                <div className="progress-fill" style={{ width: `${currentSubjectOverallProgress}%`, backgroundColor: currentSubObj.color }}></div>
              </div>
            </div>

            <div className="flex-col gap-6">
              {currentSubObj.books.map(book => (
                <div key={book.name} className="flex-col">
                  <h3 className="text-base font-semibold mb-3 text-white/80 border-b border-white/10 pb-2">{book.name}</h3>
                  {book.chapters.map(chapter => {
                    const prog = chapterProgress[chapter.id] || 0;
                    return (
                      <div key={chapter.id} className="p-4 mb-3 rounded-lg border border-white/5 bg-black/20">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium">{chapter.title}</span>
                          <span className="text-xs px-2 py-1 rounded bg-white/10">{prog}%</span>
                        </div>
                        <input type="range" min="0" max="100" value={prog} onChange={(e) => handleProgressChange(chapter.id, e.target.value)} style={{ '--current-color': currentSubObj.color }} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto pt-8 flex justify-between items-center border-t border-white/5">
           <div className="flex gap-2">
             <button onClick={linkDevice} className="text-sm py-2 px-3 flex items-center" style={{ background: syncId ? '#10b98133' : 'transparent', border: syncId ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)' }}>
               {syncId ? <Cloud size={16} className="mr-2 text-green-400" /> : <CloudOff size={16} className="mr-2" />}
               {syncId ? `Synced to: ${syncId}` : 'Link Cloud Device'}
               {isSyncing && <span className="ml-2 text-xs opacity-50">(syncing...)</span>}
             </button>
           </div>
           <button onClick={clearData} className="danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}><Trash2 size={16} /> Reset</button>
        </div>
      </div>
    </div>
  );
}
