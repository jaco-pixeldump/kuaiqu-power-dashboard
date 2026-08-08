import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Power, Zap, Activity, Settings, Unlock, Shield, Battery, Bell, 
  LineChart as LineChartIcon, Play, Square, Download, Upload, 
  FileText, CheckCircle, RefreshCw, X, Eye, FileJson, Clock,
  FolderOpen, Trash2, HardDrive, Save
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const socket = io('http://localhost:3001');

const formatDuration = (totalSeconds) => {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const calculateLogStats = (dataPoints) => {
  if (!dataPoints || dataPoints.length === 0) return null;
  let minV = Infinity, maxV = -Infinity, sumV = 0;
  let minI = Infinity, maxI = -Infinity, sumI = 0;

  dataPoints.forEach(pt => {
    const v = Number(pt.vOut) || 0;
    const i = Number(pt.iOut) || 0;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    sumV += v;

    if (i < minI) minI = i;
    if (i > maxI) maxI = i;
    sumI += i;
  });

  return {
    minV: minV === Infinity ? 0 : minV,
    maxV: maxV === -Infinity ? 0 : maxV,
    avgV: sumV / dataPoints.length,
    minI: minI === Infinity ? 0 : minI,
    maxI: maxI === -Infinity ? 0 : maxI,
    avgI: sumI / dataPoints.length,
    count: dataPoints.length
  };
};

const saveJsonWithBrowserPicker = async (jsonString, defaultFilename) => {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: 'JSON Telemetry Log File',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return { success: true, method: 'picker' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.warn('showSaveFilePicker failed or unsupported, using direct download:', err);
    }
  }

  // Fallback download link
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { success: true, method: 'download' };
};

function App() {
  const [state, setState] = useState({
    vOut: 0,
    iOut: 0,
    vSet: 0,
    iSet: 0,
    outputOn: false,
    workStatus: 0,
    ovp: 0,
    ocp: 0,
    ovpEn: false,
    ocpEn: false,
    startV: 0,
    endV: 0,
    chargeEn: false,
    chargeStatus: 1,
    deviceConnected: false
  });

  const [inputV, setInputV] = useState('');
  const [inputI, setInputI] = useState('');
  const [inputOvp, setInputOvp] = useState('');
  const [inputOcp, setInputOcp] = useState('');
  const [inputStartV, setInputStartV] = useState('');
  const [inputEndV, setInputEndV] = useState('');
  
  const [connected, setConnected] = useState(false);
  
  // Real-time graph state
  const [showGraph, setShowGraph] = useState(false);
  const [history, setHistory] = useState([]);

  // Telemetry Logging state
  const [isLogging, setIsLogging] = useState(false);
  const [logBuffer, setLogBuffer] = useState([]);
  const [logStartTime, setLogStartTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadedLog, setLoadedLog] = useState(null);
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'loaded'
  const [toast, setToast] = useState(null);

  // Server Log Manager Modal state
  const [showServerLogsModal, setShowServerLogsModal] = useState(false);
  const [serverLogsList, setServerLogsList] = useState([]);
  const [loadingServerLogs, setLoadingServerLogs] = useState(false);

  const fileInputRef = useRef(null);
  const isLoggingRef = useRef(isLogging);

  useEffect(() => {
    isLoggingRef.current = isLogging;
  }, [isLogging]);

  // Log recording timer
  useEffect(() => {
    let interval = null;
    if (isLogging) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLogging]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('state', (newState) => {
      setState(newState);
      
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const isoTime = now.toISOString();

      const newPoint = {
        time: timeStr,
        isoTime: isoTime,
        timestamp: now.getTime(),
        vOut: newState.vOut,
        iOut: newState.iOut,
        vSet: newState.vSet,
        iSet: newState.iSet,
        outputOn: newState.outputOn,
        workStatus: newState.workStatus
      };
      
      // Update live history for graph (keep last 60 points)
      setHistory(prev => [...prev.slice(-59), newPoint]);

      // Record to log buffer if logging is active
      if (isLoggingRef.current) {
        setLogBuffer(prev => [...prev, newPoint]);
      }
    });

    socket.on('error', (msg) => alert(msg));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('state');
      socket.off('error');
    };
  }, []);

  const fetchServerLogs = async () => {
    setLoadingServerLogs(true);
    try {
      const res = await fetch('http://localhost:3001/api/logs');
      const json = await res.json();
      if (json.success) {
        const sorted = (json.logs || []).sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        setServerLogsList(sorted);
      }
    } catch (err) {
      console.error('Failed to fetch server logs:', err);
    } finally {
      setLoadingServerLogs(false);
    }
  };

  const openServerLogsModal = () => {
    if (isLogging) {
      alert('Logging is currently active. Please click "Stop Log" first.');
      return;
    }
    setShowServerLogsModal(true);
    fetchServerLogs();
  };

  const toggleShowGraph = () => {
    const nextState = !showGraph;
    setShowGraph(nextState);
    socket.emit('setCurveView', nextState);
  };

  const handleStartLog = () => {
    if (isLogging) return;
    setIsLogging(true);
    setLogStartTime(new Date());
    setElapsedSeconds(0);
    setLogBuffer([]);
    setViewMode('live');
    if (!showGraph) {
      setShowGraph(true);
      socket.emit('setCurveView', true);
    }
    showToast('Telemetry logging started', 'success');
  };

  const handleStopLog = () => {
    if (!isLogging) return;
    setIsLogging(false);
    showToast(`Logging stopped. ${logBuffer.length} data points recorded.`, 'info');
  };

  const handleSaveLog = async () => {
    if (isLogging) {
      alert('Logging is currently active. Please click "Stop Log" first before saving.');
      return;
    }

    if (logBuffer.length === 0) {
      alert('No recorded log data to save. Start logging first.');
      return;
    }

    const now = new Date();
    const exportData = {
      device: "Kuaiqu SPSS-K3010R",
      version: "1.0",
      exportTime: now.toISOString(),
      startTime: logStartTime ? logStartTime.toISOString() : (logBuffer[0]?.isoTime || now.toISOString()),
      endTime: now.toISOString(),
      sampleCount: logBuffer.length,
      data: logBuffer
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const filename = `spss_log_${datePart}_${timePart}.json`;

    // Prompt user via OS file save dialog (showSaveFilePicker)
    const result = await saveJsonWithBrowserPicker(jsonStr, filename);
    if (result.success) {
      showToast(`Saved ${logBuffer.length} points to file`, 'success');
    }
  };

  const handleSaveToServerStorage = async () => {
    if (isLogging) {
      alert('Logging is currently active. Please click "Stop Log" first before saving.');
      return;
    }

    if (logBuffer.length === 0) {
      alert('No recorded log data to save. Start logging first.');
      return;
    }
    const now = new Date();
    const exportData = {
      device: "Kuaiqu SPSS-K3010R",
      version: "1.0",
      exportTime: now.toISOString(),
      startTime: logStartTime ? logStartTime.toISOString() : (logBuffer[0]?.isoTime || now.toISOString()),
      endTime: now.toISOString(),
      sampleCount: logBuffer.length,
      data: logBuffer
    };

    try {
      const res = await fetch('http://localhost:3001/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Saved to server storage: ${json.filename}`, 'success');
        fetchServerLogs();
      } else {
        alert(`Server error: ${json.error}`);
      }
    } catch (err) {
      alert(`Failed to save to server: ${err.message}`);
    }
  };

  const handleLoadLogFile = (e) => {
    if (isLogging) {
      alert('Logging is currently active. Please click "Stop Log" first before loading a file.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        let dataArray = [];
        let meta = {
          fileName: file.name,
          device: parsed.device || 'Unknown Device',
          startTime: parsed.startTime || null,
          endTime: parsed.endTime || null,
          sampleCount: 0
        };

        if (Array.isArray(parsed)) {
          dataArray = parsed;
        } else if (parsed && Array.isArray(parsed.data)) {
          dataArray = parsed.data;
        } else {
          throw new Error('Invalid log format. JSON file must contain a data array.');
        }

        if (dataArray.length === 0) {
          throw new Error('Log file contains no data points.');
        }

        meta.sampleCount = dataArray.length;
        meta.stats = calculateLogStats(dataArray);

        setLoadedLog({
          meta,
          data: dataArray
        });
        setViewMode('loaded');
        setShowGraph(true);
        showToast(`Loaded "${file.name}" (${dataArray.length} points)`, 'success');
      } catch (err) {
        alert(`Error loading log file: ${err.message}`);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLoadServerLog = async (filename) => {
    try {
      const res = await fetch(`http://localhost:3001/api/logs/${encodeURIComponent(filename)}`);
      const parsed = await res.json();
      
      let dataArray = [];
      if (Array.isArray(parsed)) {
        dataArray = parsed;
      } else if (parsed && Array.isArray(parsed.data)) {
        dataArray = parsed.data;
      } else {
        throw new Error('Invalid log format in server file.');
      }

      setLoadedLog({
        meta: {
          fileName: filename,
          device: parsed.device || 'Server Log',
          startTime: parsed.startTime || null,
          endTime: parsed.endTime || null,
          sampleCount: dataArray.length,
          stats: calculateLogStats(dataArray)
        },
        data: dataArray
      });

      setViewMode('loaded');
      setShowGraph(true);
      setShowServerLogsModal(false);
      showToast(`Loaded server log "${filename}"`, 'success');
    } catch (err) {
      alert(`Error loading server log: ${err.message}`);
    }
  };

  const handleDeleteServerLog = async (filename) => {
    if (!confirm(`Delete "${filename}" from server storage?`)) return;
    try {
      const res = await fetch(`http://localhost:3001/api/logs/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(`Deleted ${filename}`, 'info');
        fetchServerLogs();
      }
    } catch (err) {
      alert(`Failed to delete server log: ${err.message}`);
    }
  };

  const handleSetVoltage = () => {
    const v = parseFloat(inputV);
    if (!isNaN(v)) { socket.emit('setVoltage', v); setInputV(''); }
  };

  const handleSetCurrent = () => {
    const i = parseFloat(inputI);
    if (!isNaN(i)) { socket.emit('setCurrent', i / 1000); setInputI(''); }
  };

  const handleSetOvp = () => {
    const v = parseFloat(inputOvp);
    if (!isNaN(v)) { socket.emit('setOvp', v); setInputOvp(''); }
  };

  const handleSetOcp = () => {
    const a = parseFloat(inputOcp);
    if (!isNaN(a)) { socket.emit('setOcp', a / 1000); setInputOcp(''); }
  };

  const handleSetStartV = () => {
    const v = parseFloat(inputStartV);
    if (!isNaN(v)) { socket.emit('setStartV', v); setInputStartV(''); }
  };

  const handleSetEndV = () => {
    const v = parseFloat(inputEndV);
    if (!isNaN(v)) { socket.emit('setEndV', v); setInputEndV(''); }
  };

  const toggleOutput = () => socket.emit('setOutput', !state.outputOn);
  const toggleOvpEn = () => socket.emit('setOvpEn', !state.ovpEn);
  const toggleOcpEn = () => socket.emit('setOcpEn', !state.ocpEn);
  const toggleBeep = () => socket.emit('setBeep', !state.beep);
  const toggleChargeEn = () => socket.emit('setChargeEn', !state.chargeEn);
  
  const handleUnlock = () => socket.emit('unlock');

  const getChargeStatusText = (status) => {
    const statuses = { 1: "Disconnected", 2: "OK", 3: "Charging", 4: "Done", 5: "Reversed" };
    return statuses[status] || "Unknown";
  };

  const activeChartData = viewMode === 'loaded' && loadedLog ? loadedLog.data : history;
  const currentStats = viewMode === 'loaded' && loadedLog ? loadedLog.meta.stats : calculateLogStats(logBuffer);

  return (
    <div className="min-h-screen p-4 xl:p-8 flex flex-col items-center justify-start bg-gradient-to-br from-neutral-900 to-black text-white">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-lg border transition-all animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50' : 'bg-blue-950/90 text-blue-300 border-blue-500/50'
        }`}>
          <CheckCircle size={18} />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Hidden File Input for Loading JSON Log from local PC */}
      <input 
        type="file" 
        ref={fileInputRef}
        accept=".json"
        onChange={handleLoadLogFile}
        className="hidden"
      />

      {/* Server Log Browser Modal */}
      {showServerLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-2xl p-6 relative flex flex-col max-h-[85vh] border-white/20">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2 text-blue-400">
                <FolderOpen size={22} />
                Server Telemetry Log Browser
              </h3>
              <button 
                onClick={() => setShowServerLogsModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Save current recording to server button */}
            {logBuffer.length > 0 && !isLogging && (
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl mb-4 flex items-center justify-between gap-3">
                <div className="text-xs text-emerald-300">
                  <span className="font-semibold block">Active Log Buffer: {logBuffer.length} points</span>
                  Save this recording directly to server storage (`backend/logs/`)
                </div>
                <button 
                  onClick={handleSaveToServerStorage}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
                >
                  <Save size={14} /> Save Current to Server
                </button>
              </div>
            )}

            {/* Server Logs List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingServerLogs ? (
                <div className="text-center py-12 text-gray-400 flex items-center justify-center gap-2">
                  <RefreshCw size={18} className="animate-spin" /> Loading server files...
                </div>
              ) : serverLogsList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-dashed border-white/10 rounded-xl">
                  <HardDrive size={36} className="mx-auto mb-2 opacity-40" />
                  No saved logs found on server storage.
                </div>
              ) : (
                serverLogsList.map((file) => (
                  <div 
                    key={file.filename}
                    className="bg-surface/80 hover:bg-surface border border-white/10 p-3 rounded-xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-white truncate flex items-center gap-2">
                        <FileJson size={16} className="text-purple-400 shrink-0" />
                        {file.filename}
                      </div>
                      <div className="text-xs text-gray-400 flex gap-4 mt-0.5 font-mono">
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                        <span>{new Date(file.created).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleLoadServerLog(file.filename)}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all active:scale-95"
                        title="Load into graph"
                      >
                        <Eye size={14} /> Load
                      </button>

                      <a 
                        href={`http://localhost:3001/api/logs/${encodeURIComponent(file.filename)}`}
                        download={file.filename}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-white/10 p-1.5 rounded-lg transition-colors"
                        title="Download to PC"
                      >
                        <Download size={14} />
                      </a>

                      <button 
                        onClick={() => handleDeleteServerLog(file.filename)}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 p-1.5 rounded-lg transition-colors"
                        title="Delete from server"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 pt-3 mt-4 flex justify-between items-center text-xs text-gray-400">
              <span>{serverLogsList.length} files stored on server</span>
              <button 
                onClick={() => setShowServerLogsModal(false)}
                className="btn-secondary py-1 px-4 text-xs"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      <div className="w-full max-w-[1600px] px-2 xl:px-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl xl:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
              <Zap className="text-emerald-400" size={36} />
              Kuaiqu SPSS-K3010R dashboard
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle Graph View Button */}
            <button 
              onClick={toggleShowGraph}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${
                showGraph 
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' 
                  : 'bg-surface text-gray-400 border-white/10 hover:text-white'
              }`}
            >
              <LineChartIcon size={18} />
              {showGraph ? 'Hide Curve' : 'Show Curve'}
            </button>

            {/* Hardware/Backend Connection Indicator */}
            <div 
              className="flex items-center gap-2 cursor-help bg-surface/60 border border-white/10 px-3 py-2 rounded-lg"
              title={connected ? (state.deviceConnected ? 'Backend Connected, Hardware Connected' : 'Backend Connected, Hardware Disconnected') : 'Backend Disconnected'}
            >
              <span className="relative flex h-3 w-3">
                {(connected && state.deviceConnected) && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${(connected && state.deviceConnected) ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {(connected && state.deviceConnected) ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time & Log Curve Graph Section */}
        {showGraph && (
          <div className="glass-panel p-4 mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
            
            {/* Curve Controls & Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-white/10 pb-3">
              
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <Activity size={22} className="text-blue-400"/> 
                  {viewMode === 'loaded' ? 'Loaded Telemetry Log' : 'Output Curve'}
                </h3>

                {/* Live Voltage & Current Telemetry Badges */}
                {viewMode === 'live' && (
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/40 px-2.5 py-1 rounded-lg">
                      <span className="text-blue-400 font-bold uppercase">V:</span>
                      <span className="font-bold text-white tabular-nums">{state.vOut.toFixed(2)} V</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/40 px-2.5 py-1 rounded-lg">
                      <span className="text-orange-400 font-bold uppercase">I:</span>
                      <span className="font-bold text-white tabular-nums">{state.iOut.toFixed(3)} A</span>
                    </div>
                  </div>
                )}

                {viewMode === 'loaded' ? (
                  <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                    <FileJson size={14} />
                    {loadedLog?.meta.fileName}
                  </span>
                ) : isLogging ? (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/50 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-red-500"></span>
                    LOGGING: {formatDuration(elapsedSeconds)} ({logBuffer.length} pts)
                  </span>
                ) : logBuffer.length > 0 ? (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-full font-medium">
                    Log Buffer: {logBuffer.length} pts
                  </span>
                ) : null}
              </div>

              {/* Log Toolbar Actions (Start, End, Save, Load, Server Browser) */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Mode switch if viewing loaded file */}
                {viewMode === 'loaded' && (
                  <button 
                    onClick={() => !isLogging && setViewMode('live')}
                    disabled={isLogging}
                    className={`text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all ${
                      !isLogging 
                        ? 'btn-secondary border-purple-500/50 text-purple-300 hover:bg-purple-500/10' 
                        : 'bg-surface text-gray-600 border border-white/5 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <RefreshCw size={14} /> Back to Live Curve
                  </button>
                )}

                {/* Log Start / Log End */}
                {!isLogging ? (
                  <button 
                    onClick={handleStartLog}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 font-medium py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Play size={14} className="fill-current" /> Start Log
                  </button>
                ) : (
                  <button 
                    onClick={handleStopLog}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-all active:scale-95 animate-pulse"
                  >
                    <Square size={14} className="fill-current" /> Stop Log
                  </button>
                )}

                {/* Log Save with Native OS Browser File Picker */}
                <button 
                  onClick={handleSaveLog}
                  disabled={isLogging || logBuffer.length === 0}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                    !isLogging && logBuffer.length > 0 
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 active:scale-95' 
                      : 'bg-surface text-gray-600 border border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    isLogging 
                      ? "Stop logging first before saving" 
                      : logBuffer.length > 0 
                      ? "Save current recorded log to JSON file via OS Save dialog" 
                      : "Record telemetry first to save"
                  }
                >
                  <Download size={14} /> Save Log {!isLogging && logBuffer.length > 0 && `(${logBuffer.length})`}
                </button>

                {/* Log Load from Local File */}
                <button 
                  onClick={() => !isLogging && fileInputRef.current?.click()}
                  disabled={isLogging}
                  className={`font-medium py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
                    !isLogging 
                      ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/50 active:scale-95' 
                      : 'bg-surface text-gray-600 border border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={isLogging ? "Stop logging first before loading a file" : "Open local JSON log file"}
                >
                  <Upload size={14} /> Load Log
                </button>

                {/* Server Log File Manager Modal */}
                <button 
                  onClick={() => !isLogging && openServerLogsModal()}
                  disabled={isLogging}
                  className={`font-medium py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
                    !isLogging 
                      ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/50 active:scale-95' 
                      : 'bg-surface text-gray-600 border border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={isLogging ? "Stop logging first before accessing server logs" : "Browse and manage logs stored on backend server"}
                >
                  <FolderOpen size={14} /> Server Logs
                </button>
              </div>

            </div>

            {/* Statistics Bar (If log buffer or loaded log is active) */}
            {currentStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3 bg-black/40 p-2.5 rounded-xl border border-white/5 text-xs">
                <div>
                  <span className="text-gray-500 block">Total Points</span>
                  <span className="font-semibold text-white">{currentStats.count}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Min Voltage</span>
                  <span className="font-semibold text-blue-300">{currentStats.minV.toFixed(2)} V</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Max Voltage</span>
                  <span className="font-semibold text-blue-400">{currentStats.maxV.toFixed(2)} V</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Avg Voltage</span>
                  <span className="font-semibold text-blue-200">{currentStats.avgV.toFixed(2)} V</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Min Current</span>
                  <span className="font-semibold text-orange-300">{currentStats.minI.toFixed(3)} A</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Max Current</span>
                  <span className="font-semibold text-orange-400">{currentStats.maxI.toFixed(3)} A</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Avg Current</span>
                  <span className="font-semibold text-orange-200">{currentStats.avgI.toFixed(3)} A</span>
                </div>
              </div>
            )}

            {/* Responsive Recharts Graph */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeChartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="time" stroke="#737373" tick={{fontSize: 11}} />
                  <YAxis yAxisId="left" stroke="#60a5fa" domain={['auto', 'auto']} tick={{fontSize: 11}} />
                  <YAxis yAxisId="right" orientation="right" stroke="#fb923c" domain={['auto', 'auto']} tick={{fontSize: 11}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }}
                    itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="vOut" name="Voltage (V)" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="iOut" name="Current (A)" stroke="#fb923c" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          
          {/* Column 1: Controls (Left) */}
          <div className="flex flex-col gap-3 order-2 lg:order-1">
            
            {/* Combined Card: Output State & Front Panel Control */}
            <div className="glass-panel p-4 flex flex-col gap-3">
              {/* Output Toggle Row */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold mb-1">Output State</h3>
                  <p className="text-gray-400 text-sm">Toggle main power output</p>
                </div>
                <button 
                  onClick={toggleOutput}
                  className={`p-4 rounded-full transition-all duration-300 ${state.outputOn ? 'bg-success shadow-[0_0_30px_rgba(34,197,94,0.4)] text-white' : 'bg-surface border border-white/10 text-gray-400 hover:text-white hover:border-white/30'}`}
                >
                  <Power size={32} />
                </button>
              </div>

              <div className="h-px w-full bg-white/10 my-1"></div>

              {/* Unlock Front Panel Row */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">Front Panel Lock</h4>
                  <p className="text-gray-400 text-xs">Unlock local hardware panel</p>
                </div>
                <button onClick={handleUnlock} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 border-white/20 hover:bg-white/10">
                  <Unlock size={15} />
                  Unlock Front Panel
                </button>
              </div>
            </div>

            {/* Set Values */}
            <div className="glass-panel p-3 flex-1 flex flex-col justify-center">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2"><Settings size={20}/> Target Settings</h3>
              
              <div className="space-y-3">
                <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                  <div className="w-16">
                    <span className="text-gray-400 font-medium text-sm">SET V:</span>
                    <div className="text-lg font-bold text-blue-300">{state.vSet.toFixed(2)}</div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <input 
                      type="number" 
                      placeholder="New Voltage..." 
                      className="input-styled flex-1 min-w-0"
                      value={inputV}
                      onChange={e => setInputV(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSetVoltage()}
                    />
                    <button onClick={handleSetVoltage} className="btn-primary py-2 px-4 whitespace-nowrap">Set</button>
                  </div>
                </div>

                <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                  <div className="w-16">
                    <span className="text-gray-400 font-medium text-sm">SET I:</span>
                    <div className="text-lg font-bold text-orange-300">{state.iSet.toFixed(3)}</div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <input 
                      type="number" 
                      placeholder="Current (mA)..." 
                      className="input-styled flex-1 min-w-0"
                      value={inputI}
                      onChange={e => setInputI(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSetCurrent()}
                    />
                    <button onClick={handleSetCurrent} className="btn-primary py-2 px-4 whitespace-nowrap bg-orange-500 hover:bg-orange-600 focus:ring-orange-500">Set</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Main Telemetry (Center) */}
          <div className="glass-panel p-4 flex flex-col justify-center gap-4 relative overflow-hidden order-1 lg:order-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-400 text-lg font-medium tracking-wider uppercase">Output Voltage</h2>
                <div className={`text-xs px-2 py-1 rounded border ${state.workStatus === 0 ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>CV</div>
              </div>
              <div className="flex items-baseline gap-2 justify-center">
                <span className="text-7xl font-bold tracking-tighter text-white tabular-nums">
                  {state.vOut.toFixed(2)}
                </span>
                <span className="text-2xl text-blue-400 font-medium">V</span>
              </div>
            </div>

            <div className="h-px w-full bg-white/10 my-2"></div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-400 text-lg font-medium tracking-wider uppercase">Output Current</h2>
                <div className={`text-xs px-2 py-1 rounded border ${state.workStatus === 1 ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>CC</div>
              </div>
              <div className="flex items-baseline gap-2 justify-center">
                <span className="text-7xl font-bold tracking-tighter text-white tabular-nums">
                  {state.iOut.toFixed(3)}
                </span>
                <span className="text-2xl text-orange-400 font-medium">A</span>
              </div>
            </div>
          </div>

          {/* Column 3: Advanced Settings (Right) */}
          <div className="glass-panel p-3 order-3 lg:order-3">
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2"><Shield size={20}/> Protection & Advanced</h3>
            
            <div className="flex flex-col gap-3">
              
              {/* OVP / OCP Block */}
              <div className="space-y-4">
                <h4 className="text-gray-400 font-medium uppercase tracking-wider text-xs mb-3 border-b border-white/5 pb-2">Protection Limits</h4>
                
                <div className="flex items-center justify-between gap-2">
                  <button onClick={toggleOvpEn} className={`px-2 py-1 rounded text-xs font-bold w-16 text-center ${state.ovpEn ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-surface border border-white/10 text-gray-400'}`}>
                    OVP {state.ovpEn ? 'ON' : 'OFF'}
                  </button>
                  <div className="w-12 text-sm font-bold text-white">{state.ovp.toFixed(2)}</div>
                  <div className="flex gap-1 flex-1">
                    <input type="number" placeholder="V..." className="input-styled w-full text-sm px-2 py-1 min-w-0" value={inputOvp} onChange={e => setInputOvp(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetOvp()} />
                    <button onClick={handleSetOvp} className="btn-primary py-1 px-2 text-xs bg-gray-700 hover:bg-gray-600">Set</button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button onClick={toggleOcpEn} className={`px-2 py-1 rounded text-xs font-bold w-16 text-center ${state.ocpEn ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-surface border border-white/10 text-gray-400'}`}>
                    OCP {state.ocpEn ? 'ON' : 'OFF'}
                  </button>
                  <div className="w-12 text-sm font-bold text-white">{state.ocp.toFixed(3)}</div>
                  <div className="flex gap-1 flex-1">
                    <input type="number" placeholder="mA..." className="input-styled w-full text-sm px-2 py-1 min-w-0" value={inputOcp} onChange={e => setInputOcp(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetOcp()} />
                    <button onClick={handleSetOcp} className="btn-primary py-1 px-2 text-xs bg-gray-700 hover:bg-gray-600">Set</button>
                  </div>
                </div>
              </div>

              {/* Ramp Block */}
              <div className="space-y-4">
                <h4 className="text-gray-400 font-medium uppercase tracking-wider text-xs mb-3 border-b border-white/5 pb-2">Ramp Control</h4>
                
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold w-16 text-gray-400">START V:</span>
                  <div className="w-12 text-sm font-bold text-white">{state.startV.toFixed(2)}</div>
                  <div className="flex gap-1 flex-1">
                    <input type="number" placeholder="V..." className="input-styled w-full text-sm px-2 py-1 min-w-0" value={inputStartV} onChange={e => setInputStartV(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetStartV()} />
                    <button onClick={handleSetStartV} className="btn-primary py-1 px-2 text-xs bg-gray-700 hover:bg-gray-600">Set</button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold w-16 text-gray-400">END V:</span>
                  <div className="w-12 text-sm font-bold text-white">{state.endV.toFixed(2)}</div>
                  <div className="flex gap-1 flex-1">
                    <input type="number" placeholder="V..." className="input-styled w-full text-sm px-2 py-1 min-w-0" value={inputEndV} onChange={e => setInputEndV(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetEndV()} />
                    <button onClick={handleSetEndV} className="btn-primary py-1 px-2 text-xs bg-gray-700 hover:bg-gray-600">Set</button>
                  </div>
                </div>
              </div>

              {/* System Block */}
              <div className="space-y-4">
                <h4 className="text-gray-400 font-medium uppercase tracking-wider text-xs mb-3 border-b border-white/5 pb-2">System</h4>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-surface p-2 rounded-lg border border-white/5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-300"><Bell size={14}/> Buzzer</div>
                    <button onClick={toggleBeep} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${state.beep ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                      {state.beep ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-surface p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 text-xs text-gray-300"><Battery size={14}/> Charge</div>
                      {state.chargeEn && <span className="text-[10px] leading-none text-green-400 ml-5 mt-1">{getChargeStatusText(state.chargeStatus)}</span>}
                    </div>
                    <button onClick={toggleChargeEn} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${state.chargeEn ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                      {state.chargeEn ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* App Footer */}
        <div className="text-center pb-8 pt-6">
          <p className="text-gray-500 text-xs tracking-wide">
            &copy; 2026 - proudly done by Marco Fusetti with ai support
          </p>
        </div>
        
      </div>
    </div>
  );
}

export default App;


