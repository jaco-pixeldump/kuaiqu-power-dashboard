const ModbusRTU = require("modbus-serial");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const REGS = {
    REMOTE: 0,
    V_SET: 1,
    I_SET: 3,
    OUTPUT: 27,
    V_OUT: 29,
    I_OUT: 31,
    WORK_STATUS: 33,
    OVP_EN: 34,
    OCP_EN: 35,
    OVP: 36,
    OCP: 38,
    START_V: 40,
    END_V: 42,
    MAX_V: 69,
    MAX_A: 70,
    BEEP: 75,
    CHARGE_EN: 76,
    CHARGE_STATUS: 83
};

function floatToRegisters(value) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(value, 0);
    return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
}

function registersToFloat(reg1, reg2) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(reg1, 0);
    buf.writeUInt16BE(reg2, 2);
    return buf.readFloatBE(0);
}

function int32ToRegisters(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
}

function registersToInt32(reg1, reg2) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(reg1, 0);
    buf.writeUInt16BE(reg2, 2);
    return buf.readUInt32BE(0);
}

class PowerSupplyService {
    constructor(port = process.env.SERIAL_PORT || '/dev/ttyUSB0') {
        this.client = new ModbusRTU();
        this.port = port;
        this.connected = false;
        this.isPolling = false;
        
        this.state = {
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
            beep: false,
            chargeEn: false,
            chargeStatus: 1,
            deviceConnected: false
        };
        
        this.onUpdate = null; // Callback for state updates
        this.commandQueue = []; // Queue for write operations to prevent collision with polling
    }

    async connect() {
        try {
            await this.client.connectRTUBuffered(this.port, { baudRate: 9600, parity: 'none', stopBits: 1, dataBits: 8 });
            this.client.setTimeout(1000);
            this.client.setID(1);
            this.connected = true;
            console.log(`Connected to Modbus on ${this.port}`);
            
            // Start unlocked
            await this.client.writeRegister(REGS.REMOTE, 0);
            
            this.startPolling();
            return true;
        } catch (err) {
            console.error(`Failed to connect to ${this.port}:`, err.message);
            this.connected = false;
            return false;
        }
    }

    async enqueueCommand(fn) {
        return new Promise((resolve, reject) => {
            this.commandQueue.push(async () => {
                try {
                    const res = await fn();
                    resolve(res);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    startPolling() {
        if (this.isPolling) return;
        this.isPolling = true;
        
        const poll = async () => {
            if (!this.connected) {
                this.state.deviceConnected = false;
                if (this.onUpdate) this.onUpdate(this.state);
                
                // Attempt automatic reconnect
                try {
                    await this.client.connectRTUBuffered(this.port, { baudRate: 9600, parity: 'none', stopBits: 1, dataBits: 8 });
                    this.client.setTimeout(1000);
                    this.client.setID(1);
                    this.connected = true;
                    console.log(`Reconnected to Modbus on ${this.port}`);
                } catch (e) {
                    this.connected = false;
                }
                setTimeout(poll, 2000);
                return;
            }
            
            try {
                // Execute queued commands first
                while (this.commandQueue.length > 0) {
                    const cmd = this.commandQueue.shift();
                    await cmd();
                    await delay(50);
                }

                // 1. Block Read 0..5 (V_SET, I_SET)
                try {
                    const b1 = await this.client.readHoldingRegisters(0, 5);
                    this.state.vSet = Number(registersToFloat(b1.data[1], b1.data[2]).toFixed(3));
                    this.state.iSet = Number(registersToFloat(b1.data[3], b1.data[4]).toFixed(3));
                } catch (e) {
                    // Ignore single block glitch
                }
                await delay(30);

                // 2. Block Read 27..7 (OUTPUT, V_OUT, I_OUT, WORK_STATUS)
                try {
                    const b2 = await this.client.readHoldingRegisters(27, 7);
                    this.state.outputOn = b2.data[0] === 1;
                    this.state.vOut = Number(registersToFloat(b2.data[2], b2.data[3]).toFixed(3));
                    this.state.iOut = Number(registersToFloat(b2.data[4], b2.data[5]).toFixed(3));
                    this.state.workStatus = b2.data[6];
                    this.state.deviceConnected = true;
                } catch (e) {
                    console.warn("Telemetry Block 2 read error:", e.message);
                    this.state.deviceConnected = false;
                }
                await delay(30);

                // 3. Block Read 34..10 (OVP_EN, OCP_EN, OVP, OCP, START_V, END_V)
                try {
                    const b3 = await this.client.readHoldingRegisters(34, 10);
                    this.state.ovpEn = b3.data[0] === 1;
                    this.state.ocpEn = b3.data[1] === 1;
                    this.state.ovp = registersToInt32(b3.data[2], b3.data[3]) / 1000.0;
                    this.state.ocp = registersToInt32(b3.data[4], b3.data[5]) / 1000.0;
                    this.state.startV = registersToInt32(b3.data[6], b3.data[7]) / 1000.0;
                    this.state.endV = registersToInt32(b3.data[8], b3.data[9]) / 1000.0;
                } catch (e) {
                    // Ignore single block glitch
                }
                await delay(30);

                // 4. Block Read 75..9 (BEEP, CHARGE_EN, CHARGE_STATUS)
                try {
                    const b4 = await this.client.readHoldingRegisters(75, 9);
                    this.state.beep = b4.data[0] === 1;
                    this.state.chargeEn = b4.data[1] === 1;
                    this.state.chargeStatus = b4.data[8];
                } catch (e) {
                    // Ignore system block glitch
                }
                
                if (this.onUpdate) {
                    this.onUpdate(this.state);
                }
                
            } catch (err) {
                console.error("Polling loop error:", err.message);
                this.state.deviceConnected = false;
            }
            
            setTimeout(poll, 500);
        };
        
        poll();
    }

    // Commands
    async _executeWithRemote(fn) {
        return this.enqueueCommand(async () => {
            await this.client.writeRegister(REGS.REMOTE, 1);
            await delay(50);
            await fn();
            await delay(50);
            await this.client.writeRegister(REGS.REMOTE, 0);
        });
    }

    async setVoltage(v) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.V_SET, floatToRegisters(v));
            this.state.vSet = v;
        });
    }
    
    async setCurrent(i) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.I_SET, floatToRegisters(i));
            this.state.iSet = i;
        });
    }

    async setOutput(on) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegister(REGS.OUTPUT, on ? 1 : 0);
            this.state.outputOn = on;
        });
    }
    
    async unlock() {
        return this.enqueueCommand(async () => {
            await this.client.writeRegister(REGS.REMOTE, 0);
            console.log("Unlocked front panel");
        });
    }

    async setOvp(v) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.OVP, int32ToRegisters(v * 1000));
            this.state.ovp = v;
        });
    }

    async setOcp(a) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.OCP, int32ToRegisters(a * 1000));
            this.state.ocp = a;
        });
    }

    async setOvpEn(on) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegister(REGS.OVP_EN, on ? 1 : 0);
            this.state.ovpEn = on;
        });
    }

    async setOcpEn(on) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegister(REGS.OCP_EN, on ? 1 : 0);
            this.state.ocpEn = on;
        });
    }

    async setStartV(v) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.START_V, int32ToRegisters(v * 1000));
            this.state.startV = v;
        });
    }

    async setEndV(v) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegisters(REGS.END_V, int32ToRegisters(v * 1000));
            this.state.endV = v;
        });
    }

    async setBeep(on) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegister(REGS.BEEP, on ? 1 : 0);
            this.state.beep = on;
        });
    }

    async setChargeEn(on) {
        return this._executeWithRemote(async () => {
            await this.client.writeRegister(REGS.CHARGE_EN, on ? 1 : 0);
            this.state.chargeEn = on;
        });
    }
}

module.exports = new PowerSupplyService();
