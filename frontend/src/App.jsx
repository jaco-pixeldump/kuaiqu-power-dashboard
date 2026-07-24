import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Power, Zap, Activity, Settings, Unlock, Shield, Battery, Bell, LineChart as LineChartIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const socket = io('http://localhost:3001');

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

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('state', (newState) => {
      setState(newState);
      
      // Update history for graph
      setHistory(prev => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        const newPoint = {
          time: timeStr,
          vOut: newState.vOut,
          iOut: newState.iOut
        };
        
        // Keep last 60 data points
        return [...prev.slice(-59), newPoint];
      });
    });

    socket.on('error', (msg) => alert(msg));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('state');
      socket.off('error');
    };
  }, []);

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

  return (
    <div className="min-h-screen p-4 xl:p-8 flex flex-col items-center justify-start bg-gradient-to-br from-neutral-900 to-black">
      
      <div className="w-full max-w-[1600px] px-2 xl:px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3">
              <Zap className="text-emerald-400" size={36} />
              Kuaiqu SPSS-K3010R dashboard
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowGraph(!showGraph)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${showGraph ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-surface text-gray-400 border-white/10 hover:text-white'}`}
            >
              <LineChartIcon size={18} />
              {showGraph ? 'Hide Curve' : 'Show Curve'}
            </button>
            <div 
              className="flex items-center gap-2 cursor-help"
              title={connected ? (state.deviceConnected ? 'Backend Connected, Hardware Connected' : 'Backend Connected, Hardware Disconnected') : 'Backend Disconnected'}
            >
              <span className="relative flex h-3 w-3">
                {(connected && state.deviceConnected) && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${(connected && state.deviceConnected) ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Curve Graph */}
        {showGraph && (
          <div className="glass-panel p-3 mb-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-xl font-semibold mb-2 flex items-center gap-2"><Activity size={20}/> Output curve</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" stroke="#888" tick={{fontSize: 12}} />
                  <YAxis yAxisId="left" stroke="#60a5fa" domain={['auto', 'auto']} tick={{fontSize: 12}} />
                  <YAxis yAxisId="right" orientation="right" stroke="#fb923c" domain={['auto', 'auto']} tick={{fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ fontWeight: 'bold' }}
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
            
            {/* Output Toggle */}
            <div className="glass-panel p-3 flex items-center justify-between">
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

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-4">
          <button onClick={handleUnlock} className="btn-secondary flex items-center gap-2">
            <Unlock size={18} />
            Unlock Front Panel
          </button>
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
