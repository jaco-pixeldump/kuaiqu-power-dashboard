const ModbusRTU = require("modbus-serial");

async function run() {
    const client = new ModbusRTU();
    try {
        console.log("Attempting connection to /dev/ttyUSB0...");
        await client.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600, parity: 'none', stopBits: 1, dataBits: 8 });
        client.setTimeout(1000);
        client.setID(1);
        console.log("Connected. Reading REG_V_OUT (29)...");
        
        const res = await client.readHoldingRegisters(29, 2);
        console.log("Raw Registers:", res.data);
        
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(res.data[0], 0);
        buf.writeUInt16BE(res.data[1], 2);
        console.log("Decoded Float:", buf.readFloatBE(0));

    } catch (err) {
        console.error("Error occurred:", err.message);
        if (err.name === 'PortNotOpenError') {
            console.error("Is the port correct and do you have permissions? (e.g. dialout group)");
        }
    } finally {
        client.close();
        process.exit();
    }
}

run();
