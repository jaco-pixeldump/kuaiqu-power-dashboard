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
                this.isPolling = false;
                return;
            }
            
            this.state.deviceConnected = true;
            
            try {
                // Execute queued commands first
                while (this.commandQueue.length > 0) {
                    const cmd = this.commandQueue.shift();
                    await cmd();
                    await delay(100); // Small delay after commands
                }
                
                // Read Output Voltage and Current
                const vOutRes = await this.client.readHoldingRegisters(REGS.V_OUT, 2);
                this.state.vOut = Number(registersToFloat(vOutRes.data[0], vOutRes.data[1]).toFixed(3));
                await delay(30);
                
                const iOutRes = await this.client.readHoldingRegisters(REGS.I_OUT, 2);
                this.state.iOut = Number(registersToFloat(iOutRes.data[0], iOutRes.data[1]).toFixed(3));
                await delay(30);
                
                // Read Settings (V_SET, I_SET)
                const vSetRes = await this.client.readHoldingRegisters(REGS.V_SET, 2);
                this.state.vSet = Number(registersToFloat(vSetRes.data[0], vSetRes.data[1]).toFixed(3));
                await delay(30);
                
                const iSetRes = await this.client.readHoldingRegisters(REGS.I_SET, 2);
                this.state.iSet = Number(registersToFloat(iSetRes.data[0], iSetRes.data[1]).toFixed(3));
                await delay(30);
                
                // Read Status & Output
                const statRes = await this.client.readHoldingRegisters(REGS.OUTPUT, 1);
                this.state.outputOn = statRes.data[0] === 1;
                await delay(30);
                
                const workRes = await this.client.readHoldingRegisters(REGS.WORK_STATUS, 1);
                this.state.workStatus = workRes.data[0];
                await delay(30);

                // Read Protection Limits
                const ovpRes = await this.client.readHoldingRegisters(REGS.OVP, 2);
                this.state.ovp = registersToInt32(ovpRes.data[0], ovpRes.data[1]) / 1000.0;
                await delay(30);

                const ocpRes = await this.client.readHoldingRegisters(REGS.OCP, 2);
                this.state.ocp = registersToInt32(ocpRes.data[0], ocpRes.data[1]) / 1000.0;
                await delay(30);

                const ovpEnRes = await this.client.readHoldingRegisters(REGS.OVP_EN, 1);
                this.state.ovpEn = ovpEnRes.data[0] === 1;
                await delay(30);

                const ocpEnRes = await this.client.readHoldingRegisters(REGS.OCP_EN, 1);
                this.state.ocpEn = ocpEnRes.data[0] === 1;
                await delay(30);

                // Read Ramps
                const startVRes = await this.client.readHoldingRegisters(REGS.START_V, 2);
                this.state.startV = registersToInt32(startVRes.data[0], startVRes.data[1]) / 1000.0;
                await delay(30);

                const endVRes = await this.client.readHoldingRegisters(REGS.END_V, 2);
                this.state.endV = registersToInt32(endVRes.data[0], endVRes.data[1]) / 1000.0;
                await delay(30);

                // Read System states
                const beepRes = await this.client.readHoldingRegisters(REGS.BEEP, 1);
                this.state.beep = beepRes.data[0] === 1;
                await delay(30);

                const chargeEnRes = await this.client.readHoldingRegisters(REGS.CHARGE_EN, 1);
                this.state.chargeEn = chargeEnRes.data[0] === 1;
                await delay(30);

                const chargeStatRes = await this.client.readHoldingRegisters(REGS.CHARGE_STATUS, 1);
                this.state.chargeStatus = chargeStatRes.data[0];
                
                if (this.onUpdate) {
                    this.onUpdate(this.state);
                }
                
            } catch (err) {
                console.error("Polling error:", err.message);
            }
            
            setTimeout(poll, 1000); // Poll every 1 second
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
