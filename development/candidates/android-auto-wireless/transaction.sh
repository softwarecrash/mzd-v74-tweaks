#!/bin/sh
# Shared transaction adapter for the bench-test candidate.
# Preload changes are part of the SM patches, hence the libraries are file records.
. "$ROOT/lib/bundle.sh" || return 1
. "$HERE/stop-runtime.sh" || return 1
. "$HERE/upstream.sh" || return 1
mzd_bundle_prerequisites() { mzd_aaw_preflight; }
mzd_bundle_before_uninstall() { mzd_aaw_stop_runtime; }
mzd_aaw_validate_libraries() {
    . "$ROOT/lib/shim.sh" || return 1
    for library in libpatch-blmjciaapa.so libpatch-aap_service.so; do
        mzd_shim_elf "$HERE/assets/upstream/$library" || return 1
    done
}
mzd_aaw_transaction() {
    case "${1:-}" in install|validate-install) mzd_aaw_validate_libraries || return 1;;esac
    mzd_bundle_main "$@"
}
