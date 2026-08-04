import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, BarChart3, Clock, BookOpen, Trash2, List, Upload, Download, BrainCircuit, Target, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Webcam from "react-webcam";
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { SYLLABUS } from './syllabusData';
import './index.css';

// Convert SYLLABUS object into array, maintaining books and flattening chapters for stats
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

  useEffect(() => {
    const s = localStorage.getItem('cbse_study_sessions');
    if (s) try { setSessions(JSON.parse(s)); } catch(e){}
    const p = localStorage.getItem('cbse_chapter_progress');
    if (p) try { setChapterProgress(JSON.parse(p)); } catch(e){}
    const c = localStorage.getItem('cbse_chapter_completions');
    if (c) try { setChapterCompletions(JSON.parse(c)); } catch(e){}
    const ed = localStorage.getItem('cbse_exam_date');
    if (ed) setExamDate(ed);
  }, []);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTime((prev) => {
          if (isPomodoro) {
            if (prev <= 1) {
              playChime(); setIsRunning(false); setIsBreak(!isBreak);
              return isBreak ? 1500 : 300; 
            }
            return prev - 1;
          } else return prev + 1;
        });
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

  useEffect(() => {
    const sub = SUBJECTS.find(s => s.id === activeSubject);
    if (sub && sub.chapters.length > 0) {
      const exists = sub.chapters.some(c => c.id === activeChapter);
      if (!exists) setActiveChapter(sub.chapters[0].id);
    }
  }, [activeSubject]);

  const toggleTimer = () => {
    if (!isRunning) { setFocusWarning(false); noFaceFrames.current = 0; }
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
    
    setIsRunning(false); setIsBreak(false);
    if (!isPomodoro) setTime(0);
  };

  const handleProgressChange = (chapId, val) => {
    const p = parseInt(val);
    const updatedProg = { ...chapterProgress, [chapId]: p };
    setChapterProgress(updatedProg);
    localStorage.setItem('cbse_chapter_progress', JSON.stringify(updatedProg));

    if (p === 100 && !chapterCompletions[chapId]) {
      const updatedComp = { ...chapterCompletions, [chapId]: new Date().toISOString() };
      setChapterCompletions(updatedComp);
      localStorage.setItem('cbse_chapter_completions', JSON.stringify(updatedComp));
    }
  };

  const clearData = () => {
    if (confirm('Delete all data?')) {
      setSessions([]); setChapterProgress({}); setChapterCompletions({});
      localStorage.clear();
    }
  };

  const handleCloudSync = () => {
    const data = { s: sessions, p: chapterProgress, c: chapterCompletions };
    const encoded = btoa(JSON.stringify(data));
    prompt("Copy this Sync Code:", encoded);
  };

  const handleCloudImport = () => {
    const code = prompt("Paste your Sync Code:");
    if (code) {
      try {
        const decoded = JSON.parse(atob(code));
        if (decoded.s) setSessions(decoded.s);
        if (decoded.p) setChapterProgress(decoded.p);
        if (decoded.c) setChapterCompletions(decoded.c);
        localStorage.setItem('cbse_study_sessions', JSON.stringify(decoded.s));
        localStorage.setItem('cbse_chapter_progress', JSON.stringify(decoded.p));
        localStorage.setItem('cbse_chapter_completions', JSON.stringify(decoded.c));
        alert("Sync successful!");
      } catch(e) { alert("Invalid Sync Code!"); }
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

  const calculateSubjectProgress = (subjectObj) => {
    if (!subjectObj || subjectObj.chapters.length === 0) return 0;
    let totalPercent = 0;
    subjectObj.chapters.forEach(c => totalPercent += (chapterProgress[c.id] || 0));
    return Math.round(totalPercent / subjectObj.chapters.length);
  };
  const currentSubjectOverallProgress = calculateSubjectProgress(currentSubObj);

  return (
    <div className="app-container">
      {/* LEFT PANEL */}
      <div className="glass-panel flex-col justify-center relative">
        {focusWarning && (
          <div className="absolute top-4 left-4 right-4 bg-red-500/20 border border-red-500 text-red-500 p-3 rounded-md text-center text-sm font-bold flex items-center justify-center gap-2">
            <AlertTriangle size={16} /> Focus Lost! Timer Paused.
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

          <div className="text-center mb-4">
            <button 
              className="text-xs flex items-center justify-center mx-auto" 
              style={{ background: 'transparent', color: isFaceTrackingEnabled ? '#10b981' : '#a1a1aa' }}
              onClick={() => setIsFaceTrackingEnabled(!isFaceTrackingEnabled)}
            >
              {isFaceTrackingEnabled ? <Eye size={14} className="mr-1"/> : <EyeOff size={14} className="mr-1"/>}
              {isFaceTrackingEnabled ? 'Focus Tracking ON' : 'Focus Tracking OFF'}
            </button>
          </div>

          <div 
            className={`timer-circle ${isRunning ? 'active' : ''}`}
            style={{ '--current-color': isBreak ? '#10b981' : currentSubObj.color }}
          >
            {isBreak && <span className="absolute top-8 text-sm font-bold tracking-widest text-[#10b981]">BREAK</span>}
            <span className="timer-time">{formatTime(time)}</span>
          </div>

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
          <div className="absolute bottom-4 right-4 w-24 h-24 rounded-lg overflow-hidden border-2 border-white/10 opacity-50">
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
            <div className="p-5 rounded-lg border border-white/5 bg-black/20">
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
              <div className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5">
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

            <div className="flex justify-between items-center mt-2 border-t border-white/5 pt-6">
              <h3 className="text-base"><Clock size={18} className="inline mr-2"/> Total Study Time</h3>
              <p className="text-xl font-bold">{formatTime(totalStudyTime)}</p>
            </div>
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
             <button onClick={handleCloudSync} className="text-sm py-2 px-3" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}><Upload size={16} /> Export Code</button>
             <button onClick={handleCloudImport} className="text-sm py-2 px-3" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}><Download size={16} /> Import</button>
           </div>
           <button onClick={clearData} className="danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}><Trash2 size={16} /> Reset</button>
        </div>
      </div>
    </div>
  );
}
