const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const psuService = require('./modbus_service');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// REST Endpoints for Server-Side Telemetry Logs
app.get('/api/logs', (req, res) => {
    try {
        const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
        const logsList = files.map(file => {
            const filePath = path.join(LOGS_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                filename: file,
                size: stats.size,
                created: stats.birthtime || stats.mtime
            };
        });
        // Sort logs from most recent to oldest
        logsList.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        res.json({ success: true, logs: logsList });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/logs', (req, res) => {
    try {
        const logData = req.body;
        if (!logData || (!logData.data && !Array.isArray(logData))) {
            return res.status(400).json({ success: false, error: 'Invalid log payload' });
        }
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10);
        const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-');
        const filename = req.body.filename || `spss_log_${datePart}_${timePart}.json`;
        const filePath = path.join(LOGS_DIR, filename);
        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf-8');
        res.json({ success: true, filename, message: 'Log saved to server successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/logs/:filename', (req, res) => {
    try {
        const safeName = path.basename(req.params.filename);
        const filePath = path.join(LOGS_DIR, safeName);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Log file not found' });
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/logs/:filename', (req, res) => {
    try {
        const safeName = path.basename(req.params.filename);
        const filePath = path.join(LOGS_DIR, safeName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true, message: 'Log deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Diagnostic endpoints for register testing
app.get('/api/scan', async (req, res) => {
    try {
        const start = parseInt(req.query.start) || 0;
        const end = parseInt(req.query.end) || 100;
        const data = await psuService.scanRegisters(start, end);
        res.json({ success: true, registers: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/test-reg', async (req, res) => {
    try {
        const { reg, val } = req.body;
        console.log(`[Test Write] Register ${reg} <= ${val}`);
        await psuService.enqueueCommand(async () => {
            await psuService.client.writeRegister(0, 1);
            await new Promise(r => setTimeout(r, 50));
            await psuService.client.writeRegister(parseInt(reg), parseInt(val));
            await new Promise(r => setTimeout(r, 50));
            await psuService.client.writeRegister(0, 0);
        });
        res.json({ success: true, reg, val, message: `Wrote ${val} to register ${reg}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Try connecting to PSU
psuService.connect().then(success => {
    if (success) {
        console.log("PSU Service started successfully.");
    } else {
        console.warn("Could not connect to PSU at startup. Check port and device.");
    }
});

// Send state updates to all connected clients
psuService.onUpdate = (state) => {
    io.emit('state', state);
};

// Handle client connections
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send immediate state on connection
    socket.emit('state', psuService.state);
    
    socket.on('setVoltage', async (v) => {
        try {
            await psuService.setVoltage(v);
            io.emit('state', psuService.state);
        } catch (err) {
            socket.emit('error', 'Failed to set voltage: ' + err.message);
        }
    });
    
    socket.on('setCurrent', async (i) => {
        try {
            await psuService.setCurrent(i);
            io.emit('state', psuService.state);
        } catch (err) {
            socket.emit('error', 'Failed to set current: ' + err.message);
        }
    });
    
    socket.on('setOutput', async (on) => {
        try {
            await psuService.setOutput(on);
            io.emit('state', psuService.state);
        } catch (err) {
            socket.emit('error', 'Failed to toggle output: ' + err.message);
        }
    });

    socket.on('unlock', async () => {
        try {
            await psuService.unlock();
            socket.emit('message', 'Front panel unlocked.');
        } catch (err) {
            socket.emit('error', 'Failed to unlock: ' + err.message);
        }
    });

    // Advanced features
    const advancedEvents = [
        { evt: 'setOvp', fn: psuService.setOvp.bind(psuService) },
        { evt: 'setOcp', fn: psuService.setOcp.bind(psuService) },
        { evt: 'setOvpEn', fn: psuService.setOvpEn.bind(psuService) },
        { evt: 'setOcpEn', fn: psuService.setOcpEn.bind(psuService) },
        { evt: 'setStartV', fn: psuService.setStartV.bind(psuService) },
        { evt: 'setEndV', fn: psuService.setEndV.bind(psuService) },
        { evt: 'setBeep', fn: psuService.setBeep.bind(psuService) },
        { evt: 'setChargeEn', fn: psuService.setChargeEn.bind(psuService) },
        { evt: 'setCurveView', fn: psuService.setCurveView.bind(psuService) }
    ];

    advancedEvents.forEach(({ evt, fn }) => {
        socket.on(evt, async (val) => {
            try {
                await fn(val);
                io.emit('state', psuService.state);
            } catch (err) {
                socket.emit('error', `Failed to ${evt}: ` + err.message);
            }
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});

