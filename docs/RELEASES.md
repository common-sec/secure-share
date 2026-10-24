# Releases and verifying a build

The app is built reproducibly: the same source always produces byte-identical files. That makes
the claim "the site runs the reviewed code" something anyone can check, instead of something to
trust.

## What gets published

| Where | What |
|---|---|
| **GitHub Pages** (`.github/workflows/pages.yml`) | `dist/` from every push to `main`, including its `SHA256SUMS` |
| **GitHub Releases** (`.github/workflows/release.yml`) | for every tag `vX.Y.Z`: `commonsec-share-vX.Y.Z.tar.gz` (the `dist/` folder), its `.sha256`, and `commonsec-share-vX.Y.Z.SHA256SUMS` (one checksum per file) |
| **CI logs** | every build prints `dist/SHA256SUMS` |

Releases up to v0.6.1 were published as `secure-sharing-vX.Y.Z…` (the app's earlier name).

The footer of the app shows the version and the commit it was built from
(`v0.7.0 · build abc1234`), linking to that commit.

## Rebuild and compare

Requirements: Git and Docker with Compose (see [DEVELOPMENT.md](DEVELOPMENT.md)). Everything
else is pinned: the Node image by digest, the npm packages by `package-lock.json`.

```bash
git clone https://github.com/common-sec/secure-share.git
cd secure-share
git checkout v0.7.0
docker compose run --rm build          # npm ci, type-check, build twice, fail if they differ
cat dist/SHA256SUMS
```

Compare with the release's `SHA256SUMS`:

```bash
diff dist/SHA256SUMS commonsec-share-v0.7.0.SHA256SUMS && echo "identical"
```

The tarball is deterministic too, so it can be recreated and compared with its `.sha256`.
`tools/package.py` (run in the pinned Python image) sets every header field itself: sorted
names, modes 755/644, owner 0, time 0, and a gzip header with no name or time. Permissions from
the checkout never leak in (on a Windows drive mounted in WSL, every file looks like `777`).

```bash
docker compose run --rm package v0.7.0       # writes release/commonsec-share-v0.7.0.tar.gz and .sha256
diff release/commonsec-share-v0.7.0.tar.gz.sha256 commonsec-share-v0.7.0.tar.gz.sha256 && echo "identical"
```

The commit is read from `.git`, so build from a git checkout of the tag (or set `BUILD_COMMIT`
to the full commit hash); otherwise `app.js`, which embeds the version, will differ. It also
embeds the source repository linked from the footer: leave `BUILD_REPOSITORY` unset for an
official release, or set it to the fork's URL (`https://github.com/<owner>/<repo>`) to rebuild a
fork's release.

## Check what the site serves

Download the served files and check them against the published checksums:

```bash
base=https://share.common-sec.org
curl -fsS "$base/SHA256SUMS" -o served.SHA256SUMS
diff served.SHA256SUMS commonsec-share-v0.7.0.SHA256SUMS
mkdir -p served && cd served
awk '{print $2}' ../served.SHA256SUMS | while read -r f; do
  mkdir -p "$(dirname "$f")" && curl -fsS "$base/$f" -o "$f"
done
sha256sum -c ../served.SHA256SUMS
```

Pages serves the latest `main`, which may be ahead of the latest tag: compare with a build of
the commit shown in the footer in that case.

## Making a release

1. Finish the roadmap item: tests pass locally and in CI, docs and [CHANGELOG.md](../CHANGELOG.md) updated.
2. Set `version` in `package.json` (and the lockfile: `npm install --package-lock-only` in the
   `dev` container), commit.
3. Manual checks against staging (Playwright covers the engines, not the real browsers): on a
   **real iPhone with Safari** and on **Edge for Windows**, send a Share with a file to another
   device (recipient downloads it), join a Chat and exchange a message, and use a Copy button.
4. Tag and push: `git tag -a vX.Y.Z -m "X.Y.Z: <feature>" && git push origin main vX.Y.Z`.
5. The Release workflow builds, checks reproducibility and publishes the release with checksums.
