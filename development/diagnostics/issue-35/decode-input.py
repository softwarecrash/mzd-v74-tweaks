"""Decode CMU ARM32 little-endian evdev captures on a computer, not the CMU."""
import argparse
import csv
from pathlib import Path
import struct
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('capture', type=Path, help='One eventN.bin from collect.sh')
args = parser.parse_args()
data = args.capture.read_bytes()
event = struct.Struct('<IIHHi')
writer = csv.writer(sys.stdout)
writer.writerow(['seconds', 'microseconds', 'type', 'code', 'value'])
names = {0: 'EV_SYN', 1: 'EV_KEY', 2: 'EV_REL', 3: 'EV_ABS', 4: 'EV_MSC'}
for offset in range(0, len(data) - event.size + 1, event.size):
    sec, usec, type_, code, value = event.unpack_from(data, offset)
    writer.writerow([sec, usec, names.get(type_, type_), code, value])
if len(data) % event.size:
    print('Capture ends with a partial input event; trailing bytes ignored.', file=sys.stderr)
