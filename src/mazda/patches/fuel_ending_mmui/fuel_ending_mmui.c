/*
 * fuel_ending_mmui.c -- LD_PRELOAD shim for the jciMMUI service (74.00.324 EU).
 *
 * Purpose: at ignition off, show the FUEL CONSUMPTION ending screen (with its
 * data) instead of the i-stop effectiveness screen on cars equipped with
 * i-stop.
 *
 * How the stock code decides (libjciuiaecoenergy.so, md5 ac44a5f1... checked by
 * the installer):
 *   - the ending state machine table (.data) references two guards through
 *     R_ARM_ABS32 symbol relocations, Effectiveness first, then Fuel:
 *       UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness()
 *         -> 1 if ending screen enabled and FeatureType in {ISTOP, ISTOP_IELOOP, ISTOP_MHYBRID}
 *       UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption()
 *         -> 1 if ending screen enabled and FeatureType in {NONE, IELOOP, MHYBRID}
 *     (HEV has its own guard, untouched.)
 *   - ecoenergy_dbus_start_EndingScreenStatus() asks the EEM service for the
 *     ending data with EEM_SetEEMUpdateScreenEnable(h, code, cb, 0):
 *     code 11 (0xb) = i-stop ending data, 12 (0xc) = fuel ending data.
 *     Code 11 is used nowhere else.
 *
 * What we do:
 *   - Effectiveness guard -> 0
 *   - Fuel guard          -> original Fuel || original Effectiveness
 *   - EEM_SetEEMUpdateScreenEnable: code 11 -> 12, everything else untouched.
 *
 * The originals are looked up in the defining library's OWN dynamic symbol
 * table (dl_iterate_phdr), not through dlsym, so the lookup cannot resolve
 * back to ourselves. Fallbacks and failures:
 *   - guards: if an original is not found, it is treated as returning 0;
 *     the redirect and the code remap are only active when BOTH original
 *     guards were found, otherwise each guard returns its original result;
 *   - EEM: if the original is not in libjcieem_client.so's own table,
 *     dlsym(RTLD_NEXT, ...) is tried as a last resort (a result pointing back
 *     into this shim is rejected); if it is still not found, the call is not
 *     forwarded: it is logged and returns -1;
 *   - every resolved pointer is compared with our own functions, so the shim
 *     never calls itself.
 * Nothing runs at load time; the lookup happens once, on the first call.
 * jciMMUI is reset_board="yes".
 * Log: /tmp/fuel-ending-mmui.log (tmpfs, capped at 32 KB): one init line,
 * then only the guard calls and the 11 -> 12 remap, i.e. a few lines per
 * ignition off; other EEM codes are not logged.
 * Links only against libc/libdl/libpthread (no librt: old glibc).
 * Only ASCII.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <elf.h>
#include <link.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define EXPORT __attribute__((visibility("default")))

static const char *const kEcoLib = "libjciuiaecoenergy.so";
static const char *const kEemLib = "libjcieem_client.so";
static const char *const kEffName =
    "UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness";
static const char *const kFuelName =
    "UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption";
static const char *const kEemName = "EEM_SetEEMUpdateScreenEnable";
static const char *const kLog = "/tmp/fuel-ending-mmui.log";

enum { kScreenEndingIstop = 11, kScreenEndingFuel = 12 };

typedef int (*guard_fn)(void);
typedef int (*eem_fn)(void *, int, void *, void *);

static pthread_once_t g_once = PTHREAD_ONCE_INIT;
static guard_fn g_eff;   /* original guards (in libjciuiaecoenergy.so) */
static guard_fn g_fuel;
static eem_fn   g_eem;   /* original (in libjcieem_client.so) */
static int      g_active; /* both guards found -> redirect + remap */

static void lg(const char *fmt, ...)
{
    struct stat st;
    if (stat(kLog, &st) == 0 && st.st_size > 32 * 1024) {
        return;
    }
    FILE *f = fopen(kLog, "a");
    if (f == NULL) {
        return;
    }
    fprintf(f, "@%ld ", (long)time(NULL));
    va_list ap;
    va_start(ap, fmt);
    vfprintf(f, fmt, ap);
    va_end(ap);
    fputc('\n', f);
    fclose(f);
}

/* Dynamic-section pointers: relocated in place on some glibc builds, raw
 * vaddrs on others. Shared objects never load at 0, so a value below the
 * load base is a raw vaddr. */
static uintptr_t fixptr(uintptr_t base, uintptr_t p)
{
    return (p < base) ? p + base : p;
}

static uint32_t gnu_hash_nsyms(const uint32_t *gh)
{
    uint32_t nbuckets = gh[0];
    uint32_t symoffset = gh[1];
    uint32_t bloom_size = gh[2];
    const uint32_t *buckets =
        (const uint32_t *)((const char *)(gh + 4) + bloom_size * sizeof(ElfW(Addr)));
    const uint32_t *chain = buckets + nbuckets;
    uint32_t last = 0;
    for (uint32_t i = 0; i < nbuckets; i++) {
        if (buckets[i] > last) {
            last = buckets[i];
        }
    }
    if (last < symoffset) {
        return symoffset;
    }
    while ((chain[last - symoffset] & 1u) == 0) {
        last++;
    }
    return last + 1;
}

static void *find_in_object(struct dl_phdr_info *info, const char *name)
{
    const ElfW(Dyn) *dyn = NULL;
    for (int i = 0; i < info->dlpi_phnum; i++) {
        if (info->dlpi_phdr[i].p_type == PT_DYNAMIC) {
            dyn = (const ElfW(Dyn) *)(info->dlpi_addr + info->dlpi_phdr[i].p_vaddr);
            break;
        }
    }
    if (dyn == NULL) {
        return NULL;
    }
    uintptr_t base = info->dlpi_addr;
    const ElfW(Sym) *symtab = NULL;
    const char *strtab = NULL;
    const uint32_t *hash = NULL;
    const uint32_t *gnuhash = NULL;
    for (; dyn->d_tag != DT_NULL; dyn++) {
        switch (dyn->d_tag) {
        case DT_SYMTAB:   symtab  = (const ElfW(Sym) *)fixptr(base, dyn->d_un.d_ptr); break;
        case DT_STRTAB:   strtab  = (const char *)fixptr(base, dyn->d_un.d_ptr); break;
        case DT_HASH:     hash    = (const uint32_t *)fixptr(base, dyn->d_un.d_ptr); break;
        case DT_GNU_HASH: gnuhash = (const uint32_t *)fixptr(base, dyn->d_un.d_ptr); break;
        default: break;
        }
    }
    if (symtab == NULL || strtab == NULL) {
        return NULL;
    }
    uint32_t n = 0;
    if (hash != NULL) {
        n = hash[1];
    } else if (gnuhash != NULL) {
        n = gnu_hash_nsyms(gnuhash);
    }
    for (uint32_t i = 1; i < n; i++) {
        const ElfW(Sym) *s = &symtab[i];
        if (s->st_shndx == SHN_UNDEF || s->st_value == 0) {
            continue;
        }
        if (ELF32_ST_TYPE(s->st_info) != STT_FUNC) {
            continue;
        }
        if (strcmp(strtab + s->st_name, name) == 0) {
            return (void *)(base + s->st_value);
        }
    }
    return NULL;
}

struct find_ctx {
    const char *lib;
    const char *name;
    void *result;
};

static int find_cb(struct dl_phdr_info *info, size_t size, void *data)
{
    (void)size;
    struct find_ctx *c = (struct find_ctx *)data;
    const char *path = info->dlpi_name;
    if (path == NULL) {
        return 0;
    }
    size_t lp = strlen(path), ll = strlen(c->lib);
    if (lp < ll || strcmp(path + lp - ll, c->lib) != 0) {
        return 0;
    }
    if (lp > ll && path[lp - ll - 1] != '/') {
        return 0;
    }
    c->result = find_in_object(info, c->name);
    return c->result != NULL;
}

static void *find_sym(const char *lib, const char *name)
{
    struct find_ctx c = { lib, name, NULL };
    dl_iterate_phdr(find_cb, &c);
    return c.result;
}

EXPORT int UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness(void);
EXPORT int UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption(void);
EXPORT int EEM_SetEEMUpdateScreenEnable(void *h, int screen, void *cb, void *arg);

static void init(void)
{
    g_eff = (guard_fn)find_sym(kEcoLib, kEffName);
    g_fuel = (guard_fn)find_sym(kEcoLib, kFuelName);
    g_eem = (eem_fn)find_sym(kEemLib, kEemName);
    if (g_eem == NULL) {
        void *p = dlsym(RTLD_NEXT, kEemName);
        if (p != NULL && p != (void *)&EEM_SetEEMUpdateScreenEnable) {
            g_eem = (eem_fn)p;
        }
    }
    /* never call ourselves */
    if ((void *)g_eff == (void *)&UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness) g_eff = NULL;
    if ((void *)g_fuel == (void *)&UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption) g_fuel = NULL;
    if ((void *)g_eem == (void *)&EEM_SetEEMUpdateScreenEnable) g_eem = NULL;
    g_active = (g_eff != NULL && g_fuel != NULL);
    lg("init eff=%p fuel=%p eem=%p -> %s", (void *)g_eff, (void *)g_fuel,
       (void *)g_eem, g_active ? "ACTIVE" : "passthrough");
}

EXPORT int UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness(void)
{
    pthread_once(&g_once, init);
    if (!g_active) {
        return g_eff ? g_eff() : 0;
    }
    int orig = g_eff();
    lg("guard Effectiveness: original=%d -> 0", orig);
    return 0;
}

EXPORT int UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption(void)
{
    pthread_once(&g_once, init);
    if (!g_active) {
        return g_fuel ? g_fuel() : 0;
    }
    int f = g_fuel();
    int e = g_eff();
    lg("guard FuelConsumption: original fuel=%d eff=%d -> %d", f, e, (f || e) ? 1 : 0);
    return (f || e) ? 1 : 0;
}

EXPORT int EEM_SetEEMUpdateScreenEnable(void *h, int screen, void *cb, void *arg)
{
    pthread_once(&g_once, init);
    if (g_eem == NULL) {
        lg("EEM screen=%d: original NOT FOUND", screen);
        return -1;
    }
    if (g_active && screen == kScreenEndingIstop) {
        lg("EEM screen %d -> %d", screen, kScreenEndingFuel);
        screen = kScreenEndingFuel;
    }
    return g_eem(h, screen, cb, arg);
}
