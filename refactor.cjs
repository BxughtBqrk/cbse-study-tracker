const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

if (!code.includes('framer-motion')) {
  code = code.replace("import { useState, useEffect, useRef } from 'react';", "import { useState, useEffect, useRef } from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';");
}

const searchStr2 = '  return (\r\n    <div className="app-container">';
const returnStartIndex = code.indexOf(searchStr2);
if (returnStartIndex > -1) {
  const newReturn = `  return (
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

      {/* LEFT PANEL / TIMER TILE */}
      <motion.div className={\`glass-panel bento-timer flex-col justify-center relative transition-all duration-500 \${isSlouching ? 'blur-md grayscale' : ''}\`}
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

        <div className="text-center mb-6">
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight">Focus Tracker</h1>
          <div className="flex justify-center gap-2 mt-4">
            <button className={\`text-xs py-1 px-4 rounded-full \${!isPomodoro ? 'bg-white text-slate-900 shadow-md' : 'bg-transparent border border-white/20'}\`} onClick={() => setIsPomodoro(false)}>Stopwatch</button>
            <button className={\`text-xs py-1 px-4 rounded-full \${isPomodoro ? 'bg-white text-slate-900 shadow-md' : 'bg-transparent border border-white/20'}\`} onClick={() => setIsPomodoro(true)}>Pomodoro</button>
          </div>
        </div>

        <div className="flex-col items-center mb-8">
          <div className="w-full max-w-[280px] mb-6 flex flex-col gap-3">
            <select value={activeSubject} onChange={(e) => setActiveSubject(e.target.value)} disabled={isRunning} className="w-full text-sm rounded-lg">
              {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={activeChapter} onChange={(e) => setActiveChapter(e.target.value)} disabled={isRunning} className="w-full text-sm rounded-lg">
              {currentSubObj.books.map(book => (
                <optgroup key={book.name} label={book.name}>
                  {book.chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="text-center mb-6 flex justify-center gap-4">
            <button 
              className="text-xs flex items-center justify-center rounded-full border-0 bg-white/5 hover:bg-white/10" 
              style={{ color: isFaceTrackingEnabled ? '#10b981' : '#94a3b8', padding: '0.5rem 1rem' }}
              onClick={() => setIsFaceTrackingEnabled(!isFaceTrackingEnabled)}
            >
              {isFaceTrackingEnabled ? <Eye size={14} className="mr-2"/> : <EyeOff size={14} className="mr-2"/>}
              AI Focus
            </button>
            <button 
              className="text-xs flex items-center justify-center rounded-full border-0 bg-white/5 hover:bg-white/10" 
              style={{ color: isHostageMode ? '#ef4444' : '#94a3b8', padding: '0.5rem 1rem' }}
              onClick={() => setIsHostageMode(!isHostageMode)}
              disabled={isRunning}
            >
              <Smartphone size={14} className="mr-2"/>
              Hostage Mode
            </button>
          </div>

          {isHostageMode && !isPhoneConnected && hostageSessionId ? (
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
               className="flex flex-col items-center justify-center mb-8 bg-slate-900/60 p-4 rounded-2xl border border-red-500/30 h-[250px] w-[250px] mx-auto"
             >
               <p className="text-xs text-red-400 mb-3 text-center font-medium leading-tight">Scan to lock your phone<br/>and start timer.</p>
               <div className="p-2 bg-white rounded-xl shadow-lg">
                 <QRCodeSVG value={\`\${window.location.origin}/?hostage=\${hostageSessionId}\`} size={120} />
               </div>
             </motion.div>
          ) : (
            <motion.div 
              className={\`timer-circle \${isRunning ? 'active' : ''}\`}
              style={{ '--current-color': isBreak ? '#10b981' : currentSubObj.color }}
              animate={{ scale: isRunning ? 1.02 : 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
            >
              {isBreak && <span className="absolute top-8 text-sm font-extrabold tracking-widest text-[#10b981]">BREAK</span>}
              <span className="timer-time font-outfit">{formatTime(time)}</span>
            </motion.div>
          )}

          <div className="flex gap-4 mt-4">
            <button className={isRunning ? "bg-white/10 text-white border border-white/20" : "primary"} onClick={toggleTimer}>
              {isRunning ? <Pause size={20} /> : <Play size={20} />}
              {isRunning ? 'Pause' : 'Start Focus'}
            </button>
            {((!isPomodoro && time > 0) || (isPomodoro && time < 1500 && !isBreak) || isBreak) && (
              <button className="danger" onClick={finishSession}><Square size={20} /> Finish</button>
            )}
          </div>
        </div>

        {isFaceTrackingEnabled && isRunning && !isBreak && (
          <div className="absolute bottom-4 right-4 w-24 h-24 rounded-xl overflow-hidden border-2 border-white/10 opacity-40 z-0 shadow-lg">
             <Webcam audio={false} ref={webcamRef} className="w-full h-full object-cover" />
          </div>
        )}
      </motion.div>

      {/* TABS TILE */}
      <motion.div className="bento-tabs flex gap-4"
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
      >
        <button className={\`tab \${activeTab === 'stats' ? 'active' : ''}\`} onClick={() => setActiveTab('stats')}><BarChart3 size={18} className="inline mr-2" /> Analytics</button>
        <button className={\`tab \${activeTab === 'syllabus' ? 'active' : ''}\`} onClick={() => setActiveTab('syllabus')}><List size={18} className="inline mr-2" /> Syllabus</button>
      </motion.div>

      {/* RIGHT PANEL CONTENT */}
      {activeTab === 'stats' && (
        <>
          <motion.div className="glass-panel bento-chart-1 flex flex-col justify-center items-center"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
          >
             <p className="text-sm text-slate-400 mb-1 flex items-center font-medium"><Clock size={16} className="mr-2"/> Today's Focus</p>
             <h3 className="text-4xl font-extrabold text-blue-400 tracking-tight">{formatTime(todayStudyTime)}</h3>
          </motion.div>
          
          <motion.div className="glass-panel bento-chart-2 flex flex-col justify-center items-center"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          >
             <p className="text-sm text-slate-400 mb-1 flex items-center font-medium"><Target size={16} className="mr-2"/> Total Focus</p>
             <h3 className="text-4xl font-extrabold text-green-400 tracking-tight">{formatTime(totalStudyTime)}</h3>
          </motion.div>

          <motion.div className="glass-panel bento-chart-wide flex flex-col"
             initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          >
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
               <h3 className="text-lg font-bold text-white">60-Day Heatmap</h3>
               <span className="text-xs text-slate-400">Study Consistency</span>
            </div>
            <div className="heatmap-grid">
              {heatmapData.map((d, i) => (
                <div key={i} className={\`heatmap-cell level-\${d.level}\`} title={\`\${d.date}: \${formatTime(d.duration)}\`} />
              ))}
            </div>

            {pieData.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/5">
                <h3 className="text-lg font-bold text-white mb-4">Time Distribution</h3>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                        {pieData.map((entry, index) => <Cell key={\`cell-\${index}\`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(val) => formatTime(val)} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} itemStyle={{color: '#fff'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            
            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center"><BrainCircuit size={18} className="mr-2 text-blue-400"/> Exam Prediction</h3>
                <input type="date" value={examDate} onChange={e => {setExamDate(e.target.value); localStorage.setItem('cbse_exam_date', e.target.value);}} className="text-sm p-2 rounded-lg bg-slate-800 border-none" />
              </div>
              <p className={\`text-sm flex items-center p-4 rounded-xl font-medium \${prediction.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : prediction.status === 'danger' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-300'}\`}>
                {prediction.status === 'success' && <CheckCircle2 size={18} className="mr-2"/>}
                {prediction.status === 'danger' && <AlertTriangle size={18} className="mr-2"/>}
                {prediction.msg}
              </p>
            </div>
            
            {revisionsDue.length > 0 && (
              <div className="mt-6 p-5 rounded-xl border border-amber-500/20 bg-amber-500/10">
                <h3 className="flex items-center text-base mb-3 text-amber-400 font-bold"><BrainCircuit size={18} className="mr-2"/> SRS Revisions Due Today</h3>
                <ul className="text-sm space-y-2">
                  {revisionsDue.map((rev, i) => (
                    <li key={i} className="flex justify-between items-center bg-black/20 p-3 rounded-lg">
                      <span className="font-medium">{rev.title}</span>
                      <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-300 rounded-md">{rev.days} days ago</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </>
      )}

      {activeTab === 'syllabus' && (
        <motion.div className="glass-panel bento-chart-wide flex-col"
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          <h2 className="mb-6 text-xl font-bold">Track Syllabus</h2>
          
          <div className="mb-8 p-6 rounded-2xl" style={{ backgroundColor: 'rgba(15,23,42,0.5)', border: \`1px solid \${currentSubObj.color}40\` }}>
            <div className="flex justify-between mb-3">
              <span className="font-bold text-lg">{currentSubObj.name} Overall</span>
              <span className="font-extrabold text-lg" style={{ color: currentSubObj.color }}>{currentSubjectOverallProgress}%</span>
            </div>
            <div className="progress-bg h-4 rounded-full">
              <div className="progress-fill h-full rounded-full" style={{ width: \`\${currentSubjectOverallProgress}%\`, backgroundColor: currentSubObj.color }}></div>
            </div>
          </div>

          <div className="flex-col gap-6">
            {currentSubObj.books.map(book => (
              <div key={book.name} className="flex-col mb-6">
                <h3 className="text-sm font-bold tracking-wider uppercase mb-4 text-slate-400 border-b border-slate-700/50 pb-2">{book.name}</h3>
                {book.chapters.map(chapter => {
                  const prog = chapterProgress[chapter.id] || 0;
                  return (
                    <div key={chapter.id} className="p-4 mb-3 rounded-xl border border-white/5 bg-slate-800/50 hover:bg-slate-800 transition-colors">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-base font-medium">{chapter.title}</span>
                        <span className="text-sm px-3 py-1 rounded-full font-bold" style={{ backgroundColor: \`\${currentSubObj.color}20\`, color: currentSubObj.color }}>{prog}%</span>
                      </div>
                      <input type="range" min="0" max="100" value={prog} onChange={(e) => handleProgressChange(chapter.id, e.target.value)} style={{ '--current-color': currentSubObj.color }} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* BOTTOM CONTROL BAR */}
      <motion.div className="col-span-full mt-4 flex justify-between items-center border-t border-white/5 pt-6"
         initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      >
         <div className="flex gap-2">
           <button onClick={linkDevice} className="text-sm py-2 px-4 rounded-full flex items-center font-medium" style={{ background: syncId ? '#10b98120' : 'rgba(255,255,255,0.05)', border: syncId ? '1px solid #10b98150' : '1px solid transparent' }}>
             {syncId ? <Cloud size={16} className="mr-2 text-emerald-400" /> : <CloudOff size={16} className="mr-2 text-slate-400" />}
             {syncId ? \`Synced: \${syncId}\` : 'Link Cloud Device'}
             {isSyncing && <span className="ml-2 text-xs opacity-50">(syncing)</span>}
           </button>
         </div>
         <button onClick={clearData} className="danger rounded-full" style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}><Trash2 size={16} /> Reset App</button>
      </motion.div>

    </motion.div>
  );
}

export default App;
`;
  code = code.substring(0, returnStartIndex) + newReturn;
  fs.writeFileSync('src/App.jsx', code);
  console.log('Successfully injected Bento Grid and Framer Motion into App.jsx');
} else {
  console.log('Failed to find return statement');
}
