"""Package dist/ as a deterministic release tarball: same files in, same bytes out, on any machine.

    docker compose run --rm package v0.6.1     # -> release/secure-sharing-v0.6.1.tar.gz (+ .sha256)

Every header field is set explicitly (sorted names, mode 755 for folders and 644 for files, owner
0, time 0) because a checkout's permissions differ between machines (e.g. 777 on a Windows drive
mounted in WSL), and GNU tar can't normalize them reliably. The gzip header has no name or time.
Runs in the pinned Python image, so the compressor is the same everywhere. See docs/RELEASES.md.
"""
import gzip
import hashlib
import io
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"v\d+\.\d+\.\d+", sys.argv[1]):
        sys.exit("usage: package.py vX.Y.Z")
    name = f"secure-sharing-{sys.argv[1]}"
    dist, out_dir = ROOT / "dist", ROOT / "release"
    if not (dist / "SHA256SUMS").is_file():
        sys.exit("dist/ is missing: run the build first (docker compose run --rm build)")

    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for path in [dist, *sorted(dist.rglob("*"), key=lambda p: p.relative_to(dist).as_posix())]:
            rel = path.relative_to(dist).as_posix()
            info = tarfile.TarInfo(name if rel == "." else f"{name}/{rel}")
            info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, "", ""
            if path.is_dir():
                info.type, info.mode = tarfile.DIRTYPE, 0o755
                tar.addfile(info)
            else:
                data = path.read_bytes()
                info.mode, info.size = 0o644, len(data)
                tar.addfile(info, io.BytesIO(data))

    out_dir.mkdir(exist_ok=True)
    archive = out_dir / f"{name}.tar.gz"
    with open(archive, "wb") as f, gzip.GzipFile(filename="", mode="wb", fileobj=f, compresslevel=9, mtime=0) as gz:
        gz.write(tar_bytes.getvalue())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (out_dir / f"{name}.tar.gz.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    (out_dir / f"{name}.SHA256SUMS").write_bytes((dist / "SHA256SUMS").read_bytes())
    print(f"{digest}  release/{archive.name}")


if __name__ == "__main__":
    main()
