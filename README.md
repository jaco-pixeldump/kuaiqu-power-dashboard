# Kuaiqu SPSS-K3010R Interactive Dashboard

A full-stack, real-time dashboard and CLI tool to control the Kuaiqu SPSS-K3010R programmable DC power supply over RS485/Modbus.

## Features
- **Frontend Dashboard**: React + Vite + Tailwind CSS. Real-time telemetry, live graphs, advanced protection settings, and ramp controls.
- **Node.js Backend**: Robust Modbus RTU implementation that manages the serial connection, handles rapid polling (CV/CC/voltage/current), and queues commands synchronously.
- **Python CLI Utilities**: Scripts to scan registers and execute single commands if a UI isn't needed.

## Project Structure
- `/frontend` - The React Vite application for the dashboard.
- `/backend` - The Express + Socket.IO server and Modbus RS485 logic.
- `modbus_cmds.py` & `modbus_scan_registers.py` - Standalone Python diagnostic utilities.

## Prerequisites
- Node.js (v18+)
- Python 3 (for CLI scripts)
- USB-to-RS485 adapter connected to the power supply

## Installation & Setup

1. **Clone the repository**

2. **Install Backend Dependencies**
```bash
cd backend
npm install
```

3. **Install Frontend Dependencies**
```bash
cd ../frontend
npm install
```

4. **Install Python Dependencies (Optional)**
```bash
python3 -m venv venv
source venv/bin/activate
pip install pymodbus
```

## Running the Application

1. **Start the Backend Server**
Ensure your RS485 adapter is at `/dev/ttyUSB0` (or update `server.js`).
```bash
cd backend
npm start
```

2. **Start the Frontend Dashboard**
```bash
cd frontend
npm run dev
```
Open your browser to `http://localhost:5173`.

## Disclaimer
This is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Kuaiqu or any of its subsidiaries. "Kuaiqu" and "SPSS-K3010R" are used strictly for nominative fair use purposes to identify the hardware this software controls.

## License
This project is licensed under the MIT License.

**MIT License Summary:**
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

&copy; 2026 - Proudly done by Marco Fusetti with AI support. mf@etlabora.info
