#!/bin/sh
# MZD Menu / GUI Extension preview tool for macOS and POSIX systems.
# Generates an interactive, standalone HTML preview of MZD Menu & GUI Extensions.

set -eu

REPO_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
TWEAK_ID="android-auto"
NO_OPEN=0
USE_EMU=0
EMU_PATH="${MZD_EMU_DIR:-}"
TAKE_SCREENSHOT=0
SCREENSHOT_OUT=""
SBN_TEXT=""
FOCUS_ROW=""
SCROLL_MODE="nearest"
PREVIEW_HTML="${PREVIEW_OUT:-/tmp/mzd-menu-preview.html}"

usage() {
    cat << HELP
Usage: $(basename "$0") [options]

Options:
  --tweak <id>         Tweak ID to preview (default: android-auto)
  --out <path>         Output path for generated preview HTML
  --no-open            Generate preview HTML file without launching browser
  --emu [path]         Sync GUI assets into mzd-emu and launch emulator (default: ../mzd-emu, or ./mzd-emu if present)
  --sbn <text>         Display an MZD Status Bar Notification (SBN) toast
  --focus <id|idx>     Focus menu row by index or ID (e.g. 7 or hud_maneuver_max_distance_m)
  --scroll <mode>      Scroll mode for initial render (nearest, start, bottom)
  --screenshot [path]  Capture 800x480 screenshot using Google Chrome
  -h, --help           Show this help message
HELP
    exit 0
}

while [ $# -gt 0 ]; do
    case "$1" in
        --tweak)
            TWEAK_ID="$2"
            shift 2
            ;;
        --out)
            PREVIEW_HTML="$2"
            shift 2
            ;;
        --no-open)
            NO_OPEN=1
            shift
            ;;
        --emu)
            USE_EMU=1
            if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then
                EMU_PATH="$2"
                shift 2
            else
                shift
            fi
            ;;
        --emu=*)
            USE_EMU=1
            EMU_PATH="${1#*=}"
            shift
            ;;
        --sbn)
            SBN_TEXT="$2"
            shift 2
            ;;
        --focus)
            FOCUS_ROW="$2"
            shift 2
            ;;
        --scroll)
            SCROLL_MODE="$2"
            shift 2
            ;;
        --screenshot)
            TAKE_SCREENSHOT=1
            if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then
                SCREENSHOT_OUT="$2"
                shift 2
            else
                shift
            fi
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            ;;
    esac
done

TWEAK_DIR="$REPO_DIR/usb/tweaks/$TWEAK_ID"
MANIFEST_CONF="$TWEAK_DIR/manifest.conf"

if [ ! -f "$MANIFEST_CONF" ]; then
    echo "Error: manifest.conf not found in $TWEAK_DIR" >&2
    exit 1
fi

. "$REPO_DIR/usb/lib/manifest.sh"
mzd_manifest_load "$MANIFEST_CONF" || {
    echo "Error: Failed to load manifest for $TWEAK_ID" >&2
    exit 1
}

if [ "$TYPE" != "gui-extension" ] && [ -z "${GUI_API:-}" ]; then
    echo "Error: Tweak $TWEAK_ID is not a GUI extension (requires type=gui-extension or gui_api=1)." >&2
    exit 1
fi

if [ -z "${GUI_ENTRYPOINT:-}" ] || [ ! -f "$TWEAK_DIR/$GUI_ENTRYPOINT" ]; then
    echo "Error: GUI entrypoint ($GUI_ENTRYPOINT) not found in $TWEAK_DIR" >&2
    exit 1
fi

if [ "$USE_EMU" -eq 1 ]; then
    if [ -n "$EMU_PATH" ]; then
        if [ -d "$EMU_PATH" ]; then
            EMU_DIR="$(CDPATH='' cd -- "$EMU_PATH" && pwd)"
        elif [ -d "$REPO_DIR/$EMU_PATH" ]; then
            EMU_DIR="$(CDPATH='' cd -- "$REPO_DIR/$EMU_PATH" && pwd)"
        else
            EMU_DIR="$EMU_PATH"
        fi
    elif [ -d "$REPO_DIR/mzd-emu" ]; then
        EMU_DIR="$REPO_DIR/mzd-emu"
    else
        EMU_DIR="$REPO_DIR/../mzd-emu"
    fi

    if [ ! -d "$EMU_DIR" ]; then
        echo "Error: mzd-emu repository not found at $EMU_DIR" >&2
        echo "Clone mzd-emu from https://github.com/ScorpAL/mzd-emu and copy the /jci folder from your CMU into it." >&2
        echo "You can pass --emu <path>, set MZD_EMU_DIR, or clone into ./mzd-emu or ../mzd-emu." >&2
        exit 1
    fi
    echo "Syncing GUI assets to $EMU_DIR..."
    mkdir -p "$EMU_DIR/data/integration/mzd-gui-runtime"
    cp -R "$REPO_DIR/usb/lib/gui-runtime/"* "$EMU_DIR/data/integration/mzd-gui-runtime/"
    mkdir -p "$EMU_DIR/data/integration/mzd-gui-modules/$ID"
    cp "$MANIFEST_CONF" "$EMU_DIR/data/integration/mzd-gui-modules/$ID/"
    cp -R "$TWEAK_DIR/assets" "$EMU_DIR/data/integration/mzd-gui-modules/$ID/"

    resident=-; service=-; translations=-
    [ -z "$GUI_RESIDENT" ] || resident="/data/integration/mzd-gui-modules/$ID/$GUI_RESIDENT"
    [ -z "$GUI_SERVICE" ] || service=$GUI_SERVICE
    [ -z "$GUI_TRANSLATIONS" ] || translations="/data/integration/mzd-gui-modules/$ID/$GUI_TRANSLATIONS"
    printf '%s\t%s\t%s\t/data/integration/mzd-gui-modules/%s/%s\t%s\t%s\t%s\n' \
        "$ID" "$GUI_MENU_PATH" "$GUI_LABEL" "$ID" "$GUI_ENTRYPOINT" "$resident" "$service" "$translations" | \
        awk -f "$REPO_DIR/usb/lib/gui-registry.awk" > "$EMU_DIR/data/integration/mzd-gui-registry.js"

    echo "Starting mzd-emu..."
    cd "$EMU_DIR"
    exec npm start
fi

if [ -e "$PREVIEW_HTML" ] && [ ! -w "$PREVIEW_HTML" ]; then
    PREVIEW_HTML="/tmp/mzd-menu-preview-$$.html"
fi

TRANSLATIONS_JS=""
if [ -n "${GUI_TRANSLATIONS:-}" ] && [ -f "$TWEAK_DIR/$GUI_TRANSLATIONS" ]; then
    TRANSLATIONS_JS=$(cat "$TWEAK_DIR/$GUI_TRANSLATIONS")
fi

SETTINGS_JSON="{}"
if [ -f "$TWEAK_DIR/assets/libpatch.conf" ]; then
    SETTINGS_JSON=$(awk '
    BEGIN { count = 0; printf "{" }
    /^[ \t]*#/ { next }
    /^[ \t]*$/ { next }
    /=/ {
        split($0, parts, "=")
        sub(/^[ \t]+/, "", parts[1]); sub(/[ \t]+$/, "", parts[1])
        sub(/^[ \t]+/, "", parts[2]); sub(/[ \t]+$/, "", parts[2])
        k = tolower(parts[1])
        v = parts[2]
        if (v ~ /^[0-9]+$/) val = v
        else if (v == "true" || v == "yes" || v == "on") val = "true"
        else if (v == "false" || v == "no" || v == "off") val = "false"
        else val = "\"" v "\""
        if (count++ > 0) printf ","
        printf "\"%s\":%s", k, val
    }
    END { printf "}" }
    ' "$TWEAK_DIR/assets/libpatch.conf")
fi

ASSETS_DIR="$TWEAK_DIR/assets"
SDK_FILE="$REPO_DIR/usb/lib/gui-runtime/sdk.js"
INLINED_ENTRY_HTML=$(sed 's/>[ \t]*</>\
</g' "$TWEAK_DIR/$GUI_ENTRYPOINT" | awk -v assets_dir="$ASSETS_DIR" -v sdk_file="$SDK_FILE" '
BEGIN {
    while ((getline l < sdk_file) > 0) sdk = sdk (sdk ? "\n" : "") l
    close(sdk_file)
}
/<script[ \t]+src="\/data\/integration\/mzd-gui-runtime\/sdk\.js"/ {
    print "<script>\n" sdk "\n</script>"
    skip_script = 1
    next
}
/<\/script>/ {
    if (skip_script) { skip_script = 0; next }
}
/<link[ \t]+.*rel="stylesheet".*href="[^"]+".*>/ {
    s = $0
    sub(/.*href="/, "", s)
    sub(/".*/, "", s)
    css_file = assets_dir "/" s
    css = ""
    while ((getline l < css_file) > 0) css = css (css ? "\n" : "") l
    close(css_file)
    if (css != "") {
        print "<style>\n" css "\n</style>"
        next
    }
}
/<script[ \t]+src="[^"]+"/ {
    s = $0
    sub(/.*src="/, "", s)
    sub(/".*/, "", s)
    js_file = assets_dir "/" s
    js = ""
    while ((getline l < js_file) > 0) js = js (js ? "\n" : "") l
    close(js_file)
    if (js != "") {
        print "<script>\n" js "\n</script>"
        skip_script = 1
        next
    }
}
{ print }
')

cat << HEADER > "$PREVIEW_HTML"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MZD Menu - ${GUI_LABEL:-$ID} (Preview)</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #000;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
}
#cmu-screen {
    width: 800px;
    height: 480px;
    background: #0c0d0e;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    border: 1px solid #222;
}
#cmu-frame {
    width: 800px;
    height: 480px;
    border: 0;
    display: block;
    background: transparent;
}
#cmu-native-menu {
    display: none;
    position: absolute;
    left: 0;
    top: 0;
    width: 800px;
    height: 480px;
    background: #0c0d0e;
    color: #fff;
    overflow: hidden;
    z-index: 10;
}
#cmu-menu-header {
    height: 64px;
    border-bottom: 1px solid #222;
    display: flex;
    align-items: center;
    padding: 0 24px;
}
#cmu-menu-back {
    cursor: pointer;
    font-size: 26px;
    margin-right: 16px;
    user-select: none;
}
#cmu-menu-title {
    font-size: 24px;
    font-weight: 600;
}
#cmu-status-msg {
    margin-left: auto;
    font-size: 14px;
    color: #8899a6;
}
#cmu-menu-list {
    height: 416px;
    overflow-y: auto;
    padding: 8px 0;
}
#preview-help {
    margin-top: 16px;
    color: #8899a6;
    font-size: 14px;
    text-align: center;
    max-width: 800px;
}
#preview-help kbd {
    background: #222;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #444;
    color: #eee;
}
#cmu-sbn {
    display: none;
    position: absolute;
    top: 1px;
    left: 59px;
    width: 626px;
    height: 58px;
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnIAAAA8CAYAAADi41egAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA4xJREFUeNrs209rE3kcx/GZZPrfiltqQd1lWWXBw4K3vXjYJyYkBR+Aj8YnoF48e/BUFyzbpZa6tuo2sTZ+f/E3Ogl4sjYZeL3gQ9JAL3N685uZsghPbl9biY9bsc3YUmwh1o2VeZ3iq7IAAOC8jab+Psu/pc+PsQ+xk9hBbOfu872TMkfcX7FfY1dj67HVRsx1GvEm4gAALibozhoRN4y9j72J7cdexh5XxeeTuBRxv8d+iW3E1mLLQg4AYOYhl07iBrHj2GFsN/fZXgq5dDv1ao64+lTuUmyxmLy9CgDAxQZdfSJXh9zl3GVHqeFSyKVn4tLt1I0ccWmrOeIAAJi909hKjrh3OeiWUsgt5HBLt1PTSdzq8U+b3Z0//iz2f/7NZQMAmKGt3RfFzWdPq/XXB6nVBrnX0veFFHLdHHPpmbjx7dQccdv93r2+ywcAMDv97fupx3p3Hj2s76Qu53br1i8ydBsbn8SJOACAufDgcOt6/T21W5XXqUOuU0y+nQoAwBzo9+79d7q41Ay5L2sGnLdTAQDm20S3dVwPAIBWKZtVVxRO4wAAWhdznosDAGgpt1YBANqjeQDnGTkAgLYScgAA7VIKOQCAlhNyAABCDgAAIQcAgJADABByAAAIOQAAhBwAgJADAEDIAQAg5AAAEHIAAEIOAAAhBwCAkAMAEHIAAEIOAAAhBwCAkAMAEHIAAEIOAAAhBwCAkAMAEHIAAEIOAAAhBwCAkAMAEHIAAPhOo2bIjVwPAID2BZ0TOQCAFsVb849O40cncwAALQo6J3IAAC2VQu6sMadyAADzq+618eqXHZoxBwDAfJrotvpE7mPsQ/4stnZfFP3t+33XCgBgdqLHrqQmS22W1d2WNqriy/D2f429jx3FVn98Xrh7dO8/AAAA///sfU0OACAIw1j7/6f7AQ8mUeZ4U7K54Vn165/wM/kAAOYb9e9y3W2Z9y7j3t+69wAAwP+vE94w0iU+4bEAAAAASUVORK5CYII=');
    background-position: center;
    background-repeat: no-repeat;
    z-index: 100;
    overflow: hidden;
}
#cmu-sbn-icon {
    position: absolute;
    top: 11px;
    left: 14px;
    width: 37px;
    height: 37px;
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAlCAYAAADFniADAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAApZJREFUeNrkmM9L40AUx6ehkKO5hCgIDQgeW/+ELlZvdncRjy77B7gFF/+ArvUiRUTrTWR1Pa6gW/+ApP4DNoWt1+RW6GHjYYWCEOc7NMUfSU1qMin4IISZDn2fvHnvzXtDHMcpO/GLRsKIw0k2K5XAYGmvycbVFYlaTMvKp0Xx632vdxwKymi1SGFxkdi2jaFOEpIUTOsO5MlJIgiC2bq+biqKIsWo16TPeiqVsof6lN5oONS8TqfTOefhY3/bbY3q8/xw4dlYj9lCA+l2u3n62g3s6I+lfnlJ9mu1yKHs21u81NBQAFpeWSGyLOub5bIpSZIaJZg0MWEXCoUyfIz617GfT2lIdO7c/MKCMzU9jfE/nglWeO1rqtvbiBAefoY8pgWCEn0iJC6wQFBJyPuAQqjj7MSRNTZQv05P2fmJVDI2UEi0NJ8Ry7JGrjYihQIEYHaq1YHVRpF01FsHK31ZXWWAOBHgYzRzJ2MpKAcEgCAfi0VWl9Xr9eS2D8oB4UIVl5aY1fYPDpKDgvJcLkdy2exgDoCGYTA/4w6FnATlpbW1J/Ou1cJaKx1VGnCVe0XcH7q1bkRysxQcPJPJeEYZthTbhzVhLKW7p/OoaQAOfnR4yJzbKyplRSEndJ3X755QtOL78K1U0v7f3eXfkpv8FMJ6RZoeWHSGzVm0wPqEZvF55fn77EzzKxVN02Qd0PeNjaElJfUptm6vVhu6Dmv8Wq7AUIDBHzUN49Vad2Z2lj2jQv0MChW1uFBeKWG9fXOjoi/rt0Hc5QUUWmlK/LnfKKpog8auNOV0f/Vk+4Ikz+bY1eh0Oy94XAtVtrbCnX1IsNm5OY227/k4gHCg9+/EfjB9oaJCFFW/S4kIpHnf6zGyBwEGAJ2HWLEHNMcuAAAAAElFTkSuQmCC');
    background-position: center;
    background-repeat: no-repeat;
}
#cmu-sbn-text {
    position: absolute;
    top: 0;
    left: 56px;
    width: 550px;
    height: 58px;
    line-height: 58px;
    font-size: 22px;
    font-weight: 500;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
</head>
<body>
<div id="cmu-screen">
    <iframe id="cmu-frame"></iframe>
    <div id="cmu-sbn">
        <div id="cmu-sbn-icon"></div>
        <div id="cmu-sbn-text"></div>
    </div>
    <div id="cmu-native-menu">
        <div id="cmu-menu-header">
            <span id="cmu-menu-back">&larr;</span>
            <span id="cmu-menu-title"></span>
            <div id="cmu-status-msg"></div>
        </div>
        <div id="cmu-menu-list"></div>
    </div>
</div>
<div id="preview-help">
    Use <kbd>&uarr;</kbd> <kbd>&darr;</kbd> or <kbd>N</kbd> / <kbd>M</kbd> to rotate multicontroller &bull; <kbd>Enter</kbd> to toggle setting &bull; <kbd>Backspace</kbd> / <kbd>ESC</kbd> for Back
</div>

<script id="tweak-frame-src" type="text/template">
HEADER

printf '%s\n' "$INLINED_ENTRY_HTML" | sed 's#</script>#<\\/script>#g' >> "$PREVIEW_HTML"

cat << 'FOOTER_START' >> "$PREVIEW_HTML"
</script>

<script>
(function() {
FOOTER_START

cat << SCRIPT_VARS >> "$PREVIEW_HTML"
    var tweakId = "$ID";
    var token = "preview";
    var settings = $SETTINGS_JSON;
    var initialSbnText = "$SBN_TEXT";
    var initialFocus = "$FOCUS_ROW";
    var initialScroll = "$SCROLL_MODE";
SCRIPT_VARS

cat << 'FOOTER_BODY' >> "$PREVIEW_HTML"
    var currentMenu = null;
    var focusedIndex = 0;

    window.MzdGuiI18n = {
        registry: {},
        register: function(id, data) {
            this.registry[id] = data;
        }
    };
FOOTER_BODY

if [ -n "$TRANSLATIONS_JS" ]; then
    printf '%s\n' "$TRANSLATIONS_JS" >> "$PREVIEW_HTML"
fi

cat << 'FOOTER_END' >> "$PREVIEW_HTML"
    var frame = document.getElementById('cmu-frame');
    var nativeMenu = document.getElementById('cmu-native-menu');
    var menuTitle = document.getElementById('cmu-menu-title');
    var menuList = document.getElementById('cmu-menu-list');
    var statusMsg = document.getElementById('cmu-status-msg');
    var menuBackBtn = document.getElementById('cmu-menu-back');
    var sbnEl = document.getElementById('cmu-sbn');
    var sbnTextEl = document.getElementById('cmu-sbn-text');
    var sbnTimer = null;

    function showSbn(text) {
        if (!sbnEl || !sbnTextEl) return;
        sbnTextEl.textContent = text;
        sbnEl.style.display = 'block';
        window.clearTimeout(sbnTimer);
        sbnTimer = window.setTimeout(function() {
            sbnEl.style.display = 'none';
        }, 5000);
    }

    function getTranslations() {
        var bundle = window.MzdGuiI18n.registry[tweakId];
        return (bundle && bundle.languages && bundle.languages.en_US) || {};
    }

    function renderNativeMenu(menu) {
        currentMenu = menu;
        focusedIndex = typeof menu.index === 'number' ? menu.index : 0;
        if (initialFocus !== '') {
            if (/^\d+$/.test(initialFocus)) {
                focusedIndex = parseInt(initialFocus, 10);
            } else {
                for (var fi = 0; fi < (menu.rows || []).length; fi++) {
                    var r = menu.rows[fi];
                    if (r.id === initialFocus || r.key === initialFocus ||
                        (initialFocus === 'distance' && r.type === 'distance')) {
                        focusedIndex = fi;
                        break;
                    }
                }
            }
        }
        menuTitle.textContent = menu.title || '';
        menuList.innerHTML = '';
        nativeMenu.style.display = 'block';

        (menu.rows || []).forEach(function(row, idx) {
            var item = document.createElement('div');
            item.className = 'menu-item' + (idx === focusedIndex ? ' focused' : '');
            item.style.cssText = 'height:56px;padding:0 24px;display:flex;align-items:center;cursor:pointer;border-bottom:1px solid #1a1a1a;font-size:20px;' +
                (idx === focusedIndex ? 'background:#e52100;color:#fff;' : 'background:transparent;color:#ddd;');

            var labelSpan = document.createElement('span');
            labelSpan.textContent = row.label;
            labelSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            item.appendChild(labelSpan);

            if (row.detail) {
                var detailSpan = document.createElement('span');
                detailSpan.textContent = row.detail;
                detailSpan.style.cssText = 'margin-left:16px;font-size:18px;color:' + (idx === focusedIndex ? '#fff' : '#888') + ';';
                item.appendChild(detailSpan);
            }

            if (row.itemStyle === 'styleOnOff' || (row.checkable && !row.radio)) {
                var toggle = document.createElement('span');
                toggle.textContent = row.checked ? '[ON]' : '[OFF]';
                toggle.style.cssText = 'margin-left:16px;font-size:16px;font-weight:bold;padding:2px 8px;border-radius:3px;' +
                    (row.checked ? (idx === focusedIndex ? 'background:#fff;color:#e52100;' : 'background:#2e7d32;color:#fff;') :
                                   (idx === focusedIndex ? 'background:#333;color:#fff;' : 'background:#444;color:#aaa;'));
                item.appendChild(toggle);
            } else if (row.checkable && row.radio) {
                var radio = document.createElement('span');
                radio.textContent = row.checked ? '●' : '○';
                radio.style.cssText = 'margin-left:16px;font-size:20px;';
                item.appendChild(radio);
            } else if (row.caret) {
                var caret = document.createElement('span');
                caret.innerHTML = '&rsaquo;';
                caret.style.cssText = 'margin-left:16px;font-size:24px;';
                item.appendChild(caret);
            }

            item.addEventListener('click', function() {
                sendSelect(idx);
            });
            item.addEventListener('mouseenter', function() {
                setFocus(idx);
            });
            menuList.appendChild(item);
        });

        var activeEl = menuList.children[focusedIndex];
        if (initialScroll === 'bottom') {
            menuList.scrollTop = menuList.scrollHeight;
        } else if (initialScroll === 'start' || initialScroll === 'top') {
            if (activeEl) activeEl.scrollIntoView({ block: 'start' });
        } else if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    }

    function setFocus(idx) {
        if (!currentMenu || !currentMenu.rows || !currentMenu.rows.length) return;
        var total = currentMenu.rows.length;
        idx = (idx % total + total) % total;
        focusedIndex = idx;
        for (var i = 0; i < menuList.children.length; i++) {
            var el = menuList.children[i];
            var isFocus = (i === focusedIndex);
            el.style.background = isFocus ? '#e52100' : 'transparent';
            el.style.color = isFocus ? '#fff' : '#ddd';
        }
        sendToFrame({ type: 'aa-native-focus', token: token, index: focusedIndex });
        var activeEl = menuList.children[focusedIndex];
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }

    function sendSelect(idx) {
        sendToFrame({ type: 'aa-native-select', token: token, index: idx });
    }

    function sendBack() {
        sendToFrame({ type: 'mzd-gui-input', token: token, action: 'back', phase: 'step' });
    }

    function sendToFrame(data) {
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage(data, '*');
        }
    }

    menuBackBtn.addEventListener('click', sendBack);

    window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data) return;

        if (data.type === 'mzd-gui-language-request') {
            sendToFrame({
                type: 'mzd-gui-language',
                token: data.token || token,
                value: {
                    language: 'en_US',
                    direction: 'ltr',
                    texts: getTranslations()
                }
            });
        } else if (data.type === 'aa-request') {
            var act = data.action;
            if (act === 'get') {
                sendToFrame({
                    type: 'aa-response',
                    token: data.token || token,
                    id: data.id,
                    state: settings,
                    error: ''
                });
            } else if (act === 'set') {
                if (data.payload && data.payload.key !== undefined) {
                    settings[data.payload.key] = data.payload.value;
                }
                sendToFrame({
                    type: 'aa-response',
                    token: data.token || token,
                    id: data.id,
                    state: settings,
                    error: ''
                });
            }
        } else if (data.type === 'aa-native-render') {
            renderNativeMenu(data.menu);
        } else if (data.type === 'aa-native-release') {
            nativeMenu.style.display = 'none';
            currentMenu = null;
        } else if (data.type === 'aa-sbn') {
            showSbn(data.text);
        } else if (data.type === 'aa-sbn-end') {
            if (sbnEl) sbnEl.style.display = 'none';
        } else if (data.type === 'mzd-gui-close') {
            if (nativeMenu.style.display !== 'none') {
                nativeMenu.style.display = 'none';
                currentMenu = null;
            }
            if (statusMsg) statusMsg.textContent = 'Closed';
        }
    });

    window.addEventListener('keydown', function(e) {
        var code = e.keyCode;
        var map = {38:'up', 40:'down', 37:'left', 39:'right', 13:'select', 77:'rotateRight', 78:'rotateLeft', 27:'back', 8:'back'};
        var act = map[code];
        if (!act) return;
        e.preventDefault();

        if (currentMenu && nativeMenu.style.display !== 'none') {
            if (act === 'up' || act === 'rotateLeft') {
                setFocus(focusedIndex - 1);
            } else if (act === 'down' || act === 'rotateRight') {
                setFocus(focusedIndex + 1);
            } else if (act === 'select') {
                sendSelect(focusedIndex);
            } else if (act === 'back') {
                sendBack();
            }
        } else {
            sendToFrame({ type: 'mzd-gui-input', token: token, action: act, phase: 'press' });
        }
    });

    window.addEventListener('keyup', function(e) {
        var code = e.keyCode;
        var map = {38:'up', 40:'down', 37:'left', 39:'right', 13:'select', 77:'rotateRight', 78:'rotateLeft', 27:'back', 8:'back'};
        var act = map[code];
        if (!act) return;
        if (!currentMenu || nativeMenu.style.display === 'none') {
            sendToFrame({ type: 'mzd-gui-input', token: token, action: act, phase: 'release' });
        }
    });

    if (initialSbnText) {
        showSbn(initialSbnText);
    }

    var doc = frame.contentWindow.document;
    doc.open();
    doc.write('<script>window.location.hash="mzdgui=' + token + '";<\/script>' +
        document.getElementById('tweak-frame-src').textContent.replace(/<\\\/script>/g, '<\/script>'));
    doc.close();
})();
</script>
</body>
</html>
FOOTER_END

echo "Generated preview HTML at: $PREVIEW_HTML"

if [ "$TAKE_SCREENSHOT" -eq 1 ]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if [ ! -x "$CHROME_BIN" ]; then
        CHROME_BIN=$(command -v google-chrome 2>/dev/null || command -v chromium 2>/dev/null || true)
    fi
    if [ -z "$CHROME_BIN" ] || [ ! -x "$CHROME_BIN" ]; then
        echo "Error: Google Chrome or Chromium executable not found." >&2
        exit 1
    fi
    OUT_FILE="${SCREENSHOT_OUT:-/tmp/mzd-menu-screenshot.png}"
    PROFILE_DIR=$(mktemp -d /tmp/chrome-preview-profile.XXXXXX)
    "$CHROME_BIN" --headless=new --user-data-dir="$PROFILE_DIR" --virtual-time-budget=2000 --screenshot="$OUT_FILE" --window-size=800,480 --no-sandbox "file://$PREVIEW_HTML"
    rm -rf "$PROFILE_DIR"
    echo "Screenshot saved to: $OUT_FILE"
fi

if [ "$NO_OPEN" -eq 0 ] && [ "$TAKE_SCREENSHOT" -eq 0 ]; then
    if [ "$(uname)" = "Darwin" ]; then
        open "$PREVIEW_HTML"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$PREVIEW_HTML"
    fi
fi
