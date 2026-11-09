# GUI extension acceptance testing

Keep isolated shell tests, DOM mocks, browser-emulator results and physical CMU
results separate. The [API guide](Gui-extensions.md) describes the implemented
Applications adapter. Use two neutral direct Applications extensions for the
baseline; Nested menu paths such as Tools/Examples should also be tested with Back at
each level; Games uses the same path logic.

## Browser emulator

Visual and interactive testing of GUI extensions can be performed using
[mzd-emu](https://github.com/ScorpAL/mzd-emu), a browser-based Mazda Connect
(JCI Opera) emulator. It executes the authentic client-side Opera GUI framework,
including the native `List2Ctrl` list control factory, textures, fonts, and status
bar notifications (`SBN`), allowing you to test multicontroller navigation and
layout without flashing files to a vehicle CMU.

### Obtaining the emulator and prerequisites

1. **Clone `mzd-emu`**:
   Get the emulator from [https://github.com/ScorpAL/mzd-emu](https://github.com/ScorpAL/mzd-emu).
   You can clone it directly inside this repository as `mzd-emu` (it is listed in
   `.gitignore` so it will not be committed or tracked), or keep it alongside as
   a sibling directory:
   ```sh
   # Option A: Clone locally inside this repository (ignored by git)
   git clone https://github.com/ScorpAL/mzd-emu.git mzd-emu

   # Option B: Clone alongside this repository
   git clone https://github.com/ScorpAL/mzd-emu.git ../mzd-emu
   ```

2. **Copy the `/jci` folder from the CMU**:
   The emulator requires a complete, genuine `/jci` folder copied from a Mazda Connect
   CMU firmware image or vehicle dump. Place the `/jci` directory directly inside the
   `mzd-emu` directory so that `mzd-emu/jci/` exists (including `/jci/gui/`,
   `/jci/fonts/`, and boot resources under `/jci/resources/`).
   > [!IMPORTANT]
   > The OEM `/jci` files contain proprietary Mazda/Johnson Controls code, textures,
   > and fonts. A partial analysis dump can boot to a blank view despite successful
   > HTTP requests. Ensure `/jci` is complete before diagnosing extension code.

3. **Install emulator dependencies**:
   ```sh
   cd <path-to-mzd-emu>
   npm install
   ```

### Staging and running via `tools/preview-menu.sh --emu`

The `tools/preview-menu.sh` helper automates staging GUI extension assets into the
emulator and starting it:

```sh
# Run with default emulator location:
sh tools/preview-menu.sh --emu

# Specify an explicit path to mzd-emu:
sh tools/preview-menu.sh --emu ./mzd-emu
sh tools/preview-menu.sh --emu /path/to/mzd-emu

# Test another tweak extension (default: android-auto):
sh tools/preview-menu.sh --tweak <id> --emu
```

**Path resolution**:
When `--emu` is invoked without a path argument, the script resolves the emulator
location in the following order:
1. `MZD_EMU_DIR` environment variable (if set).
2. `./mzd-emu` inside the repository root (if the directory exists).
3. `../mzd-emu` alongside the repository root (default behavior).

**What the tool does**:
- Stages the shared GUI runtime (`usb/lib/gui-runtime/`) into
  `<mzd-emu>/data/integration/mzd-gui-runtime/`.
- Stages the target tweak manifest, assets, and translations into
  `<mzd-emu>/data/integration/mzd-gui-modules/<id>/`.
- Generates `<mzd-emu>/data/integration/mzd-gui-registry.js` using `usb/lib/gui-registry.awk`.
- Generates the GUI hook `<mzd-emu>/data/integration/developer_mode_GuiConfig.js`
  from `tools/preview-gui-services.js` and the real `usb/lib/gui-runtime/boot.js`.
  The Lua module services do not run in the emulator, so that file emulates them
  in the browser. Keep it in sync with each `assets/service/entry.lua`. Android Auto
  settings persist in the browser's local storage, and an emulated reboot reloads
  the page. A previous hand-written hook is kept once as `developer_mode_GuiConfig.js.orig`.
- Starts the emulator with `npm start`. If it is already running, reload the page.

This provides faithful visual and interaction validation (e.g. testing `List2Ctrl`
scrolling, focus, multicontroller inputs, and status bar toast notifications) before
hardware testing. Note that this is a browser fixture, not evidence that the
persistent shell package was installed correctly on hardware.

1. Boot to the ordinary home screen; open Applications. Both neutral entries
   appear once. No extension view should have loaded before selection.
2. Open A, use rotation, tilt and Select, then Back. Confirm input feedback and
   return to Applications. Repeat with B and alternate several times.
3. Open a view and use the native Home control. Confirm the normal menu works
   and the extension no longer consumes controller input.
4. Remove one entry from the local fixture registry, reload, and confirm the
   remaining entry works. Test a missing view and a deliberate startup failure
   only in the emulator: the normal interface must stay usable.
5. Record browser version, firmware provenance, helper source revision and
   console errors. HTTP 200 checks alone do not prove any of these UI results.

## Physical CMU: technical checks and human observations

The agent can perform technical checks over SSH. A person at the display must
confirm the visible result and physical controller behavior. Do not substitute
process state or a successful HTTP request for that confirmation.

Before any mutation, record firmware, uptime, mounts, saved installations,
existing optional developer hook, module/runtime files and relevant logs. Archive
any existing owned integration and verify its saved uninstall is usable. Refuse
unknown hooks. Migrate an existing integration deliberately through its saved
worker; do not overwrite it or remove it as an incidental test setup step.
Keep SSH and the normal installer recovery path available.

Use two neutral test packages with distinct IDs, `gui_menu_path=`,
restart required, and views that display input without changing system settings.
Stage the candidate installer files and these packages deliberately; preserve
unrelated USB customizations. Do not copy a complete staging tree blindly over a
USB containing private launcher additions.

| Phase | Automated technical checks | Human confirmation |
| --- | --- | --- |
| Install A | Saved package, helper receipt, hook/runtime/registry bytes, status, logs | Normal boot; A appears once; no unsolicited view |
| Open A | Relevant GUI logs and service health | Input feedback; Back returns; native Home remains usable |
| Install B | Same helper/hook bytes reused, two registry entries | Both entries work independently after restart |
| Remove A | A removed; B and shared support retained | B still works after restart; A absent |
| Remove B | Owned hook/runtime/registry/provider removed, status and mount checks | Stock menu works after restart; both entries absent |

Compare kernel uptime before and after operations intended only to reload GUI
services. Keep an explicit full reboot separate and record it. Collect logs after
each phase and stop on unknown changes, critical status or lost normal UI.

Do not inject write failures, kill processes during flash publication, or run
full Restore originals as part of this normal CMU sequence. Fault injection and
full-reset ordering already have isolated fixtures. A physical full-reset test
needs its own scope because it can also uninstall SSH and unrelated tweaks.
Use the test-run template for verified physical results; keep raw dumps and
personal logs private. Power-loss recovery and the native Settings adapter remain
separate work.
