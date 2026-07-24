import struct
import time
from pymodbus.client import ModbusSerialClient

def registers_to_float(reg1, reg2):
    """Converts two 16-bit registers into a 32-bit float (Big Endian)"""
    try:
        b = struct.pack('>HH', reg1, reg2)
        return struct.unpack('>f', b)[0]
    except Exception:
        return 0.0

def scan_range(client, start, end, label):
    print(f"\n--- Scanning {label} (Registers {start} to {end}) ---")
    print("REG\tRAW [R1, R2]\t\tFLOAT VALUE\tINT VALUE (R1)")
    print("-" * 65)
    
    found_any = False
    for i in range(start, end):
        res = client.read_holding_registers(i, count=2)
        if not res.isError() and len(res.registers) == 2:
            r1, r2 = res.registers[0], res.registers[1]
            
            # Print if at least one register is not zero
            if r1 != 0 or r2 != 0:
                found_any = True
                f_val = registers_to_float(r1, r2)
                print(f"{i:04d}\t[{r1:05d}, {r2:05d}]\t{f_val:12.3f}\t{r1}")
        time.sleep(0.02) # Fast polling with short pause
        
    if not found_any:
        print("  (All registers in this range are empty/zero)")

def main():
    client = ModbusSerialClient(port='/dev/ttyUSB0', baudrate=9600, parity='N', stopbits=1, bytesize=8, timeout=0.2)

    if client.connect():
        print("Deep Modbus Register Scanner Started...")
        
        # 1. Scan standard and extended configuration blocks
        scan_range(client, 0, 100, "Standard & Config Block")
        scan_range(client, 100, 200, "Extended Parameters Block")
        
        # 2. Scan typical high-address blocks used by Chinese power supply firmware
        scan_range(client, 1000, 1100, "High-Address Block A")
        scan_range(client, 2000, 2100, "High-Address Block B")

        client.close()
        print("\nDeep scan complete.")
    else:
        print("[!] Connection error.")

if __name__ == '__main__':
    main()
