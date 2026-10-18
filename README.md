# Locker

A private photo and video locker for Windows.

Anything you add disappears from File Explorer, Windows Search and the Photos app. It only exists, encrypted, inside Locker. The Locker window is also **invisible in screen shares**, so it can't show up in a Teams or Zoom meeting by accident.

![Locker gallery](docs/screenshot.png)
<sub>Screenshot made with placeholder images.</sub>

> **Status:** early (v1.0.0), Windows only, **not security-audited**. Read the [threat model](#threat-model) before trusting it with anything.

---

## The gap

Many people keep private photos and videos on a laptop they also use for work or share with family. The everyday risk isn't a forensics lab. It's an accident:

- a private photo appears in Windows Search or the Start menu,
- File Explorer shows a thumbnail in "Recent" or "Quick access",
- the Photos app lists it in its timeline,
- you share your screen in a meeting while the wrong window is open.

Phones solved this years ago with dozens of "vault" apps. On Windows, a survey in October 2026 found these options:

| Option | Examples | What's missing |
|---|---|---|
| Encrypted drives and folders | [VeraCrypt](https://veracrypt.io), [Cryptomator](https://cryptomator.org) | Strong encryption but no gallery. Once unlocked they appear as a normal drive, so Explorer makes thumbnails, Search can index them, and [files can show up in Quick Access](https://community.cryptomator.org/t/files-can-be-seen-in-quick-access-windows/6713). Windows' thumbnail cache keeps those thumbnails after you lock. |
| Folder hiders and lockers | Folder Lock, Wise Folder Hider | Closed source, so you can't check what they really do. Some only hide or lock files rather than encrypt them, and strong encryption is often a paid tier. |
| Self-hosted media vaults | [PersonalMediaVault](https://github.com/AgustinSRG/PersonalMediaVault), [CryptHaven](https://github.com/BrannonSD/CryptHaven) | The closest match, and good projects. They run a local server that you use through a web browser, which is more setup than opening an app. CryptHaven is still alpha. |
| Phone vault apps | [Wolf Gallery](https://github.com/Wolf-Project777/wolf-gallery), Stingle Photos, Photok | Built for phones, with no Windows desktop app. |
| Encrypted cloud photos | [Ente](https://ente.com) | Excellent end-to-end encryption, but it needs a cloud account. It isn't a local, offline locker. |

As far as we could find, **none of them keeps its window out of screen shares**, and none is a small open-source Windows app you just open to see an encrypted gallery.

That's the gap Locker fills.

## What Locker does

- **One password.** Nothing is visible until you unlock.
- **Add means move in.** Each photo or video is encrypted into the locker, checked, and only then deleted from where it was. Drag and drop works.
- **Gallery by month**, a full-screen viewer, and videos that play and seek normally.
- **Export** turns any item back into a normal file you can share.
- **Hidden from screen capture.** Screen shares, recordings and screenshots show whatever is behind the window instead of the window itself.
- **Locks automatically** when you minimise it or lock Windows.
- **Offline.** No account, no cloud, no telemetry, no network calls.

## How it works

The whole app is about 450 lines. Its only dependency is Electron; all encryption uses Node's built-in `crypto` module.

| | |
|---|---|
| **Storage** | `%APPDATA%\Locker\vault` holds a `salt`, an encrypted `index` (names, dates, types) and one file per item, named with 32 random hex characters and no extension. Windows has nothing to recognise, preview or index. |
| **Key** | scrypt (N=2¹⁷, r=8, p=1) from your password and a random 16-byte salt. The key exists only in memory while the locker is unlocked and is zeroed when it locks. |
| **Encryption** | AES-256-GCM in 1 MiB chunks. Each chunk has its own random 96-bit nonce, and its chunk number is bound in as associated data, so chunks can't be swapped around. Chunking is what lets a video seek without decrypting the whole file. |
| **Viewing** | A custom `vault://` protocol streams decrypted bytes straight into `<img>` and `<video>`, honouring HTTP range requests. No decrypted temporary files are ever written. |
| **Import** | Encrypt to a `.part` file, rename it, re-read and decrypt it, and compare the SHA-256 with the original. Only then is the original deleted. If any step fails, the original stays untouched. |
| **Screen capture** | Electron's `setContentProtection(true)`, which calls Windows' `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. Needs Windows 10 version 2004 or later. |

The code is short enough to read in one sitting. Start with [`vault.js`](vault.js).

## Threat model

**Locker protects against**
- someone using or looking at your PC: File Explorer, Windows Search, the Photos app and thumbnails of anything you've imported;
- screen sharing, screen recording and screenshots of the Locker window;
- someone who copies the vault folder but doesn't know your password (provided the password is strong).

**Locker does not protect against**
- **Traces from before you imported.** Windows may already have thumbnails cached, Recent-files entries, Recycle Bin copies, or OneDrive or other cloud backups of the originals. After your first import, run *Disk Cleanup → Thumbnails* and check your cloud sync.
- **Recovery of deleted originals** from the disk, especially on SSDs. Turn on BitLocker or Device Encryption for full-disk coverage.
- **Malware, keyloggers**, or anyone using your PC while Locker is unlocked.
- **Memory.** Decrypted media sits in RAM while you view it and could reach the Windows page file.
- **Truncation at a chunk boundary.** Cutting whole chunks off the end of a stored file isn't detected. Reordering and tampering are.
- **Forgetting your password.** There is no recovery, by design.
- **Hiding that Locker exists.** The app itself is visible; only what's inside is private.

The design uses standard primitives, but **no independent security review has happened yet.** Reviews are very welcome.

## Install and run

**Download:** get `Locker-win-x64.zip` from the [latest release](https://github.com/Kadri-cloud/locker/releases/latest), unzip it anywhere, and run `Locker.exe`. To keep it handy, right-click `Locker.exe` and choose *Pin to Start*.

The app isn't code-signed yet, so Windows SmartScreen may say *"Windows protected your PC"*. Click *More info → Run anyway*. If you'd rather not trust a download, build it yourself from source.

**From source** (needs [Node.js](https://nodejs.org) 20 or later):

```bash
git clone https://github.com/Kadri-cloud/locker.git
cd locker
npm install
npm start          # run from source
npm test           # encryption self-check
npm run build      # makes dist/Locker-win32-x64/Locker.exe
```

**Back up** by copying `%APPDATA%\Locker\vault` somewhere safe. It's unreadable without your password.
**Uninstall** by deleting the app folder. Your locker stays in `%APPDATA%\Locker` until you delete that too, so export anything you want to keep first.

## Known limitations

- iPhone HEIC/HEIF photos are stored safely but can't be previewed. Use Export to open them.
- The gallery loads full-size files rather than thumbnails, so it may slow down with thousands of items.
- There's no way to change the password yet, and there's one locker per Windows user.
- Tested only on Windows 11. Electron also runs on macOS and Linux, but that's untested, and screen-capture hiding behaves differently on each.
- Locking when Windows locks (Win+L) uses Electron's `lock-screen` event and hasn't been tested yet. Locking on minimise has.

## Corrections welcome

This started as one person's need, and the survey above is a snapshot from October 2026. **If we got something wrong, please tell us.** That could be an app that already does all this, a project we described unfairly, a mistake in the threat model, or a flaw in the encryption. Open an [issue](https://github.com/Kadri-cloud/locker/issues) or a pull request; corrections are as welcome as code.

Especially wanted:
- a security review of [`vault.js`](vault.js) and [`main.js`](main.js),
- apps or projects we missed,
- testing on other Windows versions, and on macOS and Linux.

For **security problems**, please report privately through the repository's *Security → Report a vulnerability* page rather than a public issue.

## License

[Apache 2.0](LICENSE)
