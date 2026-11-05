/* SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * cluster_language.c -- LD_PRELOAD shim for the jciBLMSettings service (74.00.324).
 *
 * Purpose: choose the language the instrument cluster and HUD use while the CMU
 * interface keeps its own language.
 *
 * jciBLMSettings sends the "Display Characters" code (CMU control type 2, CAN PID
 * 0x4B) on every boot and language change:
 *
 *   int VBS_SETTINGS_SetCMUControlReq(Dbus_conn_s *conn, uint8_t type, uint8_t value,
 *                                     uint32_t userInfo, void *cb, void *user)
 *
 * It is a PLT import from /jci/lib/libjcivbssettingsclient.so. The HUD draws the
 * street-name line only for some codes: on a 2019 Mazda 6 (EU, color HUD) Hungarian
 * (21) hides it and English (7) shows it. This shim rewrites the value of type 2
 * requests to the configured code. Everything else is forwarded untouched.
 *
 * Configuration: libpatch.conf next to this library, read once at the first hooked
 * call. The installer generates it from the tweak settings:
 *
 *   hud_display_language = off | <language in kLanguages>
 *   hud_display_code = 0..255
 *
 * A non-zero hud_display_code wins over the language. Language names ignore case,
 * and '_' equals '-'. A missing file, a missing key and an unknown value (logged)
 * count as off and 0, which means passthrough.
 *
 * Safety: jciBLMSettings has reset_board="yes", so if this process dies the head
 * unit restarts. There is no constructor and nothing runs at load time. The shim
 * starts no threads. Outside jciBLMSettings every request passes through. If the
 * original function cannot be found the call is logged and returns -1, and the
 * lookup is retried on the next call. Successful lookups are cached.
 *
 * sm_svclauncher dlopens the service without RTLD_GLOBAL, so its libraries are in a
 * local scope that RTLD_NEXT does not always reach. The client library is therefore
 * also looked up by path with RTLD_NOLOAD. It has no DT_SONAME.
 *
 * Log: /tmp/cluster-language.log (tmpfs, capped at 32 KB).
 *
 * Link only against libc/libdl/libpthread: the head unit's old glibc has
 * clock_gettime in librt.
 */
#define _GNU_SOURCE
#include <ctype.h>
#include <dlfcn.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>
#include <time.h>

#define EXPORT __attribute__((visibility("default")))
#define TYPE_DISPLAY_CHARACTERS 2
#define LOG_LIMIT 32768

typedef int (*set_cmu_control_req_fn)(void *, uint8_t, uint8_t, uint32_t, void *, void *);

static const char *const kSymbol = "VBS_SETTINGS_SetCMUControlReq";
static const char *const kClientSo = "/jci/lib/libjcivbssettingsclient.so";
static const char *const kSettingsSo = "/jci/settings/svcjciblmsettings.so";
static const char *const kConfigName = "libpatch.conf";
static const char *const kLanguageKey = "hud_display_language";
static const char *const kCodeKey = "hud_display_code";
static const char *const kLog = "/tmp/cluster-language.log";

/* From BLM_SETTINGS_Languages_LANG_to_VBS16 in svcjciblmsettings.so 74.00.324.
 * The stock unit sends 4 for every language without an entry here. */
static const struct {
    const char *name;
    uint8_t code;
} kLanguages[] = {
    {"en-uk", 7},
    {"en-us", 4},
    {"en-au", 2},
    {"ar", 26},
    {"cs", 19},
    {"da", 16},
    {"de", 9},
    {"es", 11},
    {"es-mx", 6},
    {"fi", 18},
    {"fr", 8},
    {"fr-ca", 5},
    {"hu", 21},
    {"it", 10},
    {"ja", 1},
    {"nl", 14},
    {"no", 17},
    {"pl", 23},
    {"pt", 13},
    {"ru", 12},
    {"sk", 20},
    {"sv", 15},
    {"tr", 22},
    {"uk", 27},
    {"zh-cn", 24},
    {"zh-tw", 25},
};

static pthread_once_t g_config_once = PTHREAD_ONCE_INIT;
static uint8_t g_code; /* 0 = passthrough; written once under g_config_once */
static void *g_real;   /* the original function, once found */
static int g_in_settings;
static int g_missing_logged;

EXPORT int VBS_SETTINGS_SetCMUControlReq(void *conn, uint8_t type, uint8_t value,
                                         uint32_t user_info, void *cb, void *user);

static void log_line(const char *format, ...)
{
    struct stat st;
    FILE *f;
    va_list args;

    if (stat(kLog, &st) == 0 && st.st_size > LOG_LIMIT)
        return;
    f = fopen(kLog, "a");
    if (f == NULL)
        return;
    fprintf(f, "@%ld ", (long)time(NULL));
    va_start(args, format);
    vfprintf(f, format, args);
    va_end(args);
    fputc('\n', f);
    fclose(f);
}

/* Returns 1 and sets *code for a known value, 0 otherwise. */
static int parse_language(const char *value, uint8_t *code)
{
    size_t i, j;

    if (strcasecmp(value, "off") == 0) {
        *code = 0;
        return 1;
    }
    for (i = 0; i < sizeof(kLanguages) / sizeof(kLanguages[0]); i++) {
        const char *name = kLanguages[i].name;
        for (j = 0; name[j] != '\0' && value[j] != '\0'; j++) {
            int c = tolower((unsigned char)value[j]);
            if ((c == '_' ? '-' : c) != name[j])
                break;
        }
        if (name[j] == '\0' && value[j] == '\0') {
            *code = kLanguages[i].code;
            return 1;
        }
    }
    return 0;
}

/* Returns 1 and sets *code for 0..255, 0 otherwise. */
static int parse_code(const char *value, uint8_t *code)
{
    char *end = NULL;
    unsigned long number;

    if (!isdigit((unsigned char)value[0]))
        return 0;
    number = strtoul(value, &end, 10);
    if (*end != '\0' || number > 255)
        return 0;
    *code = (uint8_t)number;
    return 1;
}

static char *trim(char *text)
{
    char *end;

    while (isspace((unsigned char)*text))
        text++;
    end = text + strlen(text);
    while (end > text && isspace((unsigned char)end[-1]))
        *--end = '\0';
    return text;
}

static void load_config(void)
{
    Dl_info info;
    char path[256], line[128];
    const char *slash;
    FILE *f;
    int length;
    uint8_t language = 0, code = 0;

    memset(&info, 0, sizeof(info));
    if (dladdr((void *)&load_config, &info) == 0 || info.dli_fname == NULL ||
        (slash = strrchr(info.dli_fname, '/')) == NULL) {
        log_line("config: own path unknown -> off");
        return;
    }
    length = snprintf(path, sizeof(path), "%.*s/%s", (int)(slash - info.dli_fname),
                      info.dli_fname, kConfigName);
    if (length < 0 || (size_t)length >= sizeof(path) || (f = fopen(path, "r")) == NULL) {
        log_line("config: cannot read %s -> off", path);
        return;
    }
    while (fgets(line, sizeof(line), f) != NULL) {
        char *equals = strchr(line, '=');
        char *key, *value;

        if (equals == NULL)
            continue;
        *equals = '\0';
        key = trim(line);
        value = trim(equals + 1);
        if (strcasecmp(key, kLanguageKey) == 0) {
            if (!parse_language(value, &language))
                log_line("config: unknown %s=\"%s\" -> off", key, value);
        } else if (strcasecmp(key, kCodeKey) == 0) {
            if (!parse_code(value, &code))
                log_line("config: unknown %s=\"%s\" -> off", key, value);
        }
    }
    fclose(f);
    g_code = code != 0 ? code : language;
    log_line("config: code=%u", (unsigned)g_code);
}

static set_cmu_control_req_fn find_original(void)
{
    void *self = (void *)&VBS_SETTINGS_SetCMUControlReq;
    void *found = __atomic_load_n(&g_real, __ATOMIC_ACQUIRE);
    void *handle;

    if (found != NULL)
        return (set_cmu_control_req_fn)found;
    found = dlsym(RTLD_NEXT, kSymbol);
    if (found == NULL || found == self) {
        found = NULL;
        handle = dlopen(kClientSo, RTLD_NOW | RTLD_NOLOAD);
        if (handle != NULL) {
            found = dlsym(handle, kSymbol);
            if (found == self)
                found = NULL;
            dlclose(handle); /* only drops the NOLOAD reference */
        }
    }
    if (found != NULL)
        __atomic_store_n(&g_real, found, __ATOMIC_RELEASE);
    return (set_cmu_control_req_fn)found;
}

static int in_settings_service(void)
{
    void *handle;

    if (__atomic_load_n(&g_in_settings, __ATOMIC_ACQUIRE))
        return 1;
    handle = dlopen(kSettingsSo, RTLD_NOW | RTLD_NOLOAD);
    if (handle == NULL)
        return 0;
    dlclose(handle);
    __atomic_store_n(&g_in_settings, 1, __ATOMIC_RELEASE);
    return 1;
}

EXPORT int VBS_SETTINGS_SetCMUControlReq(void *conn, uint8_t type, uint8_t value,
                                         uint32_t user_info, void *cb, void *user)
{
    set_cmu_control_req_fn real;

    pthread_once(&g_config_once, load_config);
    real = find_original();
    if (real == NULL) {
        if (!__atomic_exchange_n(&g_missing_logged, 1, __ATOMIC_ACQ_REL))
            log_line("original %s not found", kSymbol);
        return -1;
    }
    if (type == TYPE_DISPLAY_CHARACTERS && g_code != 0 && value != g_code &&
        in_settings_service()) {
        log_line("Display Characters %u -> %u", (unsigned)value, (unsigned)g_code);
        value = g_code;
    }
    return real(conn, type, value, user_info, cb, user);
}
