"""Runs a command that reads a passphrase from the terminal (the age CLI does), typing it in.

Usage: python3 -I pty-pass.py PASSPHRASE TIMES -- command args...
The passphrase is typed TIMES times (age asks twice when encrypting, once when decrypting).
Standard input and output of the command are files given in its own arguments (-o, a path).
"""
import os
import pty
import sys

passphrase, times = sys.argv[1], int(sys.argv[2])
cmd = sys.argv[sys.argv.index('--') + 1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
typed, out = 0, b''
while True:
    try:
        chunk = os.read(fd, 1024)
    except OSError:
        break
    if not chunk:
        break
    out += chunk
    if typed < times and out.lower().count(b'passphrase') > typed:
        os.write(fd, passphrase.encode() + b'\n')
        typed += 1
_, status = os.waitpid(pid, 0)
code = os.waitstatus_to_exitcode(status)
if code:
    sys.stderr.write(out.decode(errors='replace'))
sys.exit(code)
