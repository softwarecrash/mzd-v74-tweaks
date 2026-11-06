/* Synthetic startup orders and concurrent first use; no Mazda libraries. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*guard_fn)(void);
typedef int (*eem_fn)(void *, int, void *, void *);
static guard_fn eff, fuel;
static eem_fn eem;

static void *load(const char *path)
{
    void *h = path ? dlopen(path, RTLD_NOW | RTLD_GLOBAL) : NULL;
    if (h == NULL) {
        fprintf(stderr, "dlopen failed: %s\n", path ? dlerror() : "missing path");
        exit(2);
    }
    return h;
}

static void *exercise(void *unused)
{
    int i;
    (void)unused;
    for (i = 0; i < 8; i++) {
        if (eff() != 0 || fuel() != 1 || eem(NULL, 8, NULL, NULL) != 7) {
            return (void *)1;
        }
    }
    return NULL;
}

int main(int argc, char **argv)
{
    int (*run)(void);
    void *eco;
    if (argc != 2) return 2;
    eem = (eem_fn)dlsym(RTLD_DEFAULT, "EEM_SetEEMUpdateScreenEnable");
    if (eem == NULL) return 2;
    load(getenv("EEM_LIB"));
    if (strcmp(argv[1], "early") == 0) {
        printf("early eem ret=%d\n", eem(NULL, 8, NULL, NULL));
    }
    eco = load(getenv("ECO_LIB"));
    run = (int (*)(void))dlsym(eco, "eco_run");
    if (run == NULL) return 2;
    if (strcmp(argv[1], "threads") == 0) {
        pthread_t threads[8];
        void *result;
        int i;
        eff = (guard_fn)dlsym(RTLD_DEFAULT, "UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsEffectiveness");
        fuel = (guard_fn)dlsym(RTLD_DEFAULT, "UIA_ECOENERGY_isPrevEngRunNEndingSetOnNEndingIsFuelConsumption");
        if (eff == NULL || fuel == NULL) return 2;
        for (i = 0; i < 8; i++) if (pthread_create(&threads[i], NULL, exercise, NULL)) return 2;
        for (i = 0; i < 8; i++) if (pthread_join(threads[i], &result) || result != NULL) return 1;
        puts("concurrent first use passed");
        return 0;
    }
    run();
    if (strcmp(argv[1], "late") == 0) {
        load(getenv("LATE_EEM_LIB"));
        puts("late EEM loaded");
        run();
    }
    return 0;
}
