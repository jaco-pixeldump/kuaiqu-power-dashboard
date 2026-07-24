const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const psuService = require('./modbus_service');

const app = express();
app.use(cors());
app.use(express.json());

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
        { evt: 'setChargeEn', fn: psuService.setChargeEn.bind(psuService) }
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
