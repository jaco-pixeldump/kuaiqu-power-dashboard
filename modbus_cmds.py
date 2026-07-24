#!/media/2t1/html/Kuaiqu-spss-k3010r/wapp/venv/bin/python
import argparse
import struct
import sys
import time
from pymodbus.client import ModbusSerialClient

# --- COMPLETE MODBUS REGISTERS MAP ---
REG_REMOTE = 0
REG_V_SET = 1
REG_I_SET = 3
REG_OUTPUT = 27
REG_V_OUT = 29
REG_I_OUT = 31
REG_WORK_STATUS = 33    # 0: CV, 1: CC
REG_OVP_EN = 34         # 0: OFF, 1: ON
REG_OCP_EN = 35         # 0: OFF, 1: ON
REG_OVP = 36            # mV (32-bit unsigned long)
REG_OCP = 38            # mA (32-bit unsigned long)
REG_START_V = 40        # mV (32-bit unsigned long)
REG_END_V = 42          # mV (32-bit unsigned long)
REG_MAX_V = 69          # Machine Max Voltage (Float or Int, let's treat safely or read as float/int based on context - actually let's check standard float or int. Usually float or integer. Let's map it as float or standard read)
REG_MAX_A = 70          # Machine Max Current
REG_BEEP = 75           # 0: OFF, 1: ON
REG_CHARGE_EN = 76      # 0: OFF, 1: ON
REG_CHARGE_STATUS = 83  # 1: Disconnected, 2: OK, 3: Charging, 4: Done, 5: Reversed

# --- CONVERSION FUNCTIONS (Float for V/I) ---
def float_to_registers(value):
    """Converts a 32-bit float into two 16-bit registers (Big Endian)"""
    b = struct.pack('>f', value)
    reg1, reg2 = struct.unpack('>HH', b)
    return [reg1, reg2]

def registers_to_float(reg1, reg2):
    """Converts two 16-bit registers into a 32-bit float (Big Endian)"""
    b = struct.pack('>HH', reg1, reg2)
    return struct.unpack('>f', b)[0]

# --- CONVERSION FUNCTIONS (32-bit Unsigned Long for mV/mA) ---
def int32_to_registers(value):
    """Converts a 32-bit integer into two 16-bit registers (Big Endian)"""
    b = struct.pack('>I', int(value))
    reg1, reg2 = struct.unpack('>HH', b)
    return [reg1, reg2]

def registers_to_int32(reg1, reg2):
    """Converts two 16-bit registers into a 32-bit integer (Big Endian)"""
    b = struct.pack('>HH', reg1, reg2)
    return struct.unpack('>I', b)[0]

# --- HELPER FUNCTIONS ---
def check_and_write_float(client, reg_address, value, name):
    if reg_address is None:
        print(f"[!] Cannot set {name}: Register address is UNKNOWN.")
        return
    regs = float_to_registers(value)
    client.write_registers(reg_address, regs)
    print(f"[*] {name} set to: {value}")
    time.sleep(0.1)

def check_and_write_int32(client, reg_address, value, name):
    if reg_address is None:
        print(f"[!] Cannot set {name}: Register address is UNKNOWN.")
        return
    regs = int32_to_registers(value)
    client.write_registers(reg_address, regs)
    print(f"[*] {name} set to: {value}")
    time.sleep(0.1)

def check_and_write_int(client, reg_address, value, name):
    if reg_address is None:
        print(f"[!] Cannot set {name}: Register address is UNKNOWN.")
        return
    client.write_register(reg_address, value)
    print(f"[*] {name} set to: {value}")
    time.sleep(0.1)


def main():
    # --- COMMAND LINE ARGUMENTS SETUP ---
    parser = argparse.ArgumentParser(
        description="Advanced Modbus RTU Power Supply Utility (Full Map)",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument('-p', '--port', type=str, default='/dev/ttyUSB0', help='Serial port (default: /dev/ttyUSB0)')
    
    # Read commands
    parser.add_argument('-rv', '--read-voltage', action='store_true', help='Read output voltage (V)')
    parser.add_argument('-rc', '--read-current', action='store_true', help='Read output current (A)')
    parser.add_argument('-rovp', '--read-ovp', action='store_true', help='Read OVP limit (V)')
    parser.add_argument('-rocp', '--read-ocp', action='store_true', help='Read OCP limit (A)')
    parser.add_argument('-rstat', '--read-status', action='store_true', help='Read CV/CC status and limits')
    
    # Write parameters (Standard V/I)
    parser.add_argument('-sv', '--set-voltage', type=float, help='Set target voltage (V)')
    parser.add_argument('-sc', '--set-current', type=float, help='Set target current (A)')
    
    # Output Control
    parser.add_argument('-o', '--output', choices=['on', 'off'], help='Turn power supply output ON or OFF')
    
    # Advanced Write parameters
    parser.add_argument('--set-ovp', type=float, help='Set OVP limit in Volts')
    parser.add_argument('--set-ocp', type=float, help='Set OCP limit in Amps')
    parser.add_argument('--ovp-en', choices=['on', 'off'], help='Enable/Disable OVP protection')
    parser.add_argument('--ocp-en', choices=['on', 'off'], help='Enable/Disable OCP protection')
    parser.add_argument('--set-start-v', type=float, help='Set Ramp Start Voltage in Volts')
    parser.add_argument('--set-end-v', type=float, help='Set Ramp End Voltage in Volts')
    parser.add_argument('--beep', choices=['on', 'off'], help='Turn buzzer ON or OFF')
    parser.add_argument('--charge-en', choices=['on', 'off'], help='Enable/Disable battery charge mode')
    
    # Utility
    parser.add_argument('-u', '--unlock', action='store_true', help='Release remote control and unlock the front panel (Local Mode)')

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)

    args = parser.parse_args()

    client = ModbusSerialClient(port=args.port, baudrate=9600, parity='N', stopbits=1, bytesize=8, timeout=1)

    if client.connect():
        # 1. Take control (Remote Mode = ON)
        client.write_register(REG_REMOTE, 1)
        time.sleep(0.1)

        # --- WRITE SECTION ---
        if args.output == 'off':
            client.write_register(REG_OUTPUT, 0)
            print("[*] Output explicitly turned OFF.")
            time.sleep(0.1)

        if args.set_voltage is not None or args.set_current is not None:
            client.write_register(REG_OUTPUT, 0)
            time.sleep(0.1)
            if args.set_voltage is not None:
                check_and_write_float(client, REG_V_SET, args.set_voltage, "Target Voltage")
            if args.set_current is not None:
                check_and_write_float(client, REG_I_SET, args.set_current, "Target Current")

        # Protection limits & enables
        if args.set_ovp is not None:
            check_and_write_int32(client, REG_OVP, int(args.set_ovp * 1000), "OVP Limit")
        if args.set_ocp is not None:
            check_and_write_int32(client, REG_OCP, int(args.set_ocp * 1000), "OCP Limit")
            
        if args.ovp_en is not None:
            check_and_write_int(client, REG_OVP_EN, 1 if args.ovp_en == 'on' else 0, "OVP Protection")
        if args.ocp_en is not None:
            check_and_write_int(client, REG_OCP_EN, 1 if args.ocp_en == 'on' else 0, "OCP Protection")

        # Ramps
        if args.set_start_v is not None:
            check_and_write_int32(client, REG_START_V, int(args.set_start_v * 1000), "Ramp Start Voltage")
        if args.set_end_v is not None:
            check_and_write_int32(client, REG_END_V, int(args.set_end_v * 1000), "Ramp End Voltage")

        # System controls
        if args.beep is not None:
            check_and_write_int(client, REG_BEEP, 1 if args.beep == 'on' else 0, "Buzzer")
        if args.charge_en is not None:
            check_and_write_int(client, REG_CHARGE_EN, 1 if args.charge_en == 'on' else 0, "Charge Mode")

        # Turn Output ON if requested or if V/A changed
        if args.output == 'on' or args.set_voltage is not None or args.set_current is not None:
            client.write_register(REG_OUTPUT, 1)
            if args.output == 'on':
                print("[*] Output explicitly turned ON.")
            time.sleep(0.1)

        # --- READ SECTION ---
        if args.read_voltage:
            res = client.read_holding_registers(REG_V_OUT, count=2)
            if not res.isError():
                print(f"[>] Output Voltage: {registers_to_float(res.registers[0], res.registers[1]):.3f} V")

        if args.read_current:
            res = client.read_holding_registers(REG_I_OUT, count=2)
            if not res.isError():
                print(f"[>] Output Current: {registers_to_float(res.registers[0], res.registers[1]):.3f} A")

        if args.read_ovp:
            res = client.read_holding_registers(REG_OVP, count=2)
            if not res.isError():
                print(f"[>] OVP Limit: {registers_to_int32(res.registers[0], res.registers[1]) / 1000.0:.3f} V")

        if args.read_ocp:
            res = client.read_holding_registers(REG_OCP, count=2)
            if not res.isError():
                print(f"[>] OCP Limit: {registers_to_int32(res.registers[0], res.registers[1]) / 1000.0:.3f} A")

        if args.read_status:
            # Read CV/CC status
            res_cv = client.read_holding_registers(REG_WORK_STATUS, count=1)
            mode = "CC (Constant Current)" if not res_cv.isError() and res_cv.registers[0] == 1 else "CV (Constant Voltage)"
            
            # Read Charge Status
            res_chg = client.read_holding_registers(REG_CHARGE_STATUS, count=1)
            chg_states = {1: "Disconnected", 2: "OK", 3: "Charging", 4: "Done", 5: "Reversed"}
            chg_text = chg_states.get(res_chg.registers[0], "Unknown") if not res_chg.isError() else "N/A"
            
            print(f"[>] Working Mode: {mode}")
            print(f"[>] Battery Charge Status: {chg_text}")

        # --- UNLOCK SECTION ---
        if args.unlock:
            client.write_register(REG_REMOTE, 0)
            print("[*] Front panel unlocked (Local Mode).")
            time.sleep(0.1)

        client.close()
    else:
        print(f"[!] Error: Unable to open port {args.port}.")

if __name__ == '__main__':
    main()
