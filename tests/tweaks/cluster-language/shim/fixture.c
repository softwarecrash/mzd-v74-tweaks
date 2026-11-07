/* Stand-ins for the Mazda files in tests/tweaks/cluster-language/shim/run.sh.
 * CLIENT: libjcivbssettingsclient.so; SERVICE: svcjciblmsettings.so; default: launcher. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#if defined(CLIENT)
int VBS_SETTINGS_SetCMUControlReq(void *conn, uint8_t type, uint8_t value, uint32_t info,
                                  void *cb, void *user)
{
    printf("real conn=%p type=%u value=%u info=%u cb=%p user=%p\n", conn, type, value,
           (unsigned)info, cb, user);
    return 40 + type;
}
#elif defined(SERVICE)
int VBS_SETTINGS_SetCMUControlReq(void *, uint8_t, uint8_t, uint32_t, void *, void *);

void service_start(void)
{
    static const uint8_t requests[][2] = {{3, 1}, {2, 21}, {4, 21}, {2, 7}};
    unsigned i;

    for (i = 0; i < 4; i++)
        printf("ret=%d\n", VBS_SETTINGS_SetCMUControlReq((void *)0x11, requests[i][0],
                                                         requests[i][1], 0x22222222,
                                                         (void *)0x33, (void *)0x44));
}
#else
/* launcher <service.so>: dlopen without RTLD_GLOBAL, like sm_svclauncher.
 * launcher direct [client.so]: call the interposed symbol with no service loaded,
 * then again once the client has been loaded. launcher idle: never call it. */
#include <string.h>
typedef int (*request_fn)(void *, uint8_t, uint8_t, uint32_t, void *, void *);

int main(int argc, char **argv)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    if (strcmp(argv[1], "idle") == 0)
        return 0;
    if (strcmp(argv[1], "direct") == 0) {
        request_fn request = (request_fn)dlsym(RTLD_DEFAULT, "VBS_SETTINGS_SetCMUControlReq");
        if (request == NULL)
            return 3;
        printf("ret=%d\n", request(0, 2, 21, 0, 0, 0));
        if (argc > 2 && dlopen(argv[2], RTLD_NOW) == NULL)
            return 4;
        printf("ret=%d\n", request(0, 2, 21, 0, 0, 0));
        return 0;
    }
    void *service = dlopen(argv[1], RTLD_NOW);
    if (service == NULL) {
        printf("dlopen: %s\n", dlerror());
        return 2;
    }
    ((void (*)(void))dlsym(service, "service_start"))();
    return 0;
}
#endif
