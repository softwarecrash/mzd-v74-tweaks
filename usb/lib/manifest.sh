#!/bin/sh
# KEY=VALUE data only: no source, eval, expansion, quotes or inline comments.
mzd_manifest_error() { printf 'Manifest: %s\n' "$*" >&2; return 1; }
mzd_manifest_id() {
    case "$1" in ''|*[!a-z0-9-]*|-*|*-|*--*) return 1 ;; esac
}
mzd_manifest_load() {
    mzd_manifest_file=$1
    [ -f "$mzd_manifest_file" ] && [ ! -L "$mzd_manifest_file" ] || {
        mzd_manifest_error 'Missing manifest or symbolic link.'; return 1;
    }
    LC_ALL=C awk '{sub(/\r$/, ""); if ($0 ~ /[[:cntrl:]]/) bad=1} END {exit bad}' "$mzd_manifest_file" || {
        mzd_manifest_error 'Control characters are not allowed.'; return 1;
    }
    COMPONENTS=; PAYLOAD_DIR=; SHIM_SERVICE=; SHIM_ASSET=; SHIM_PATH=; SHIM_EXTRA_TARGETS=; SHIM_CHECKS=
    GUI_API=; GUI_MENU_PATH=; GUI_LABEL=; GUI_ENTRYPOINT=; GUI_RESIDENT=; GUI_SERVICE=; GUI_TRANSLATIONS=
    CONFIGS=; SETTINGS=; MZD_MANIFEST_FILE=$mzd_manifest_file; mzd_manifest_settings=0; mzd_manifest_configs=0
    CONTRACT_VERSION=; ID=; NAME=; DESCRIPTION=; VERSION=; TYPE=; GROUP=
    FIRMWARE=; ENTRYPOINT=; ACTIONS=; APP=; ORIGINAL=; LOCK_GROUP=
    STATUS_SCOPE=; REBOOT_REQUIRED=; REQUIRES=; CONFLICTS=; PROGRESS=false; CONFIRMATION=; REFRESH_ALL=false; RESET_ENTRYPOINT=; PREFLIGHT=false
    mzd_manifest_seen=' '; mzd_manifest_cr=$(printf '\r')
    while IFS= read -r mzd_manifest_line || [ -n "$mzd_manifest_line" ]; do
        mzd_manifest_line=${mzd_manifest_line%"$mzd_manifest_cr"}
        case "$mzd_manifest_line" in ''|'#'*) continue ;; esac
        case "$mzd_manifest_line" in *[![:space:]]*) ;; *) continue ;; esac
        case "$mzd_manifest_line" in *=*) ;; *) mzd_manifest_error 'Expected KEY=VALUE.'; return 1 ;; esac
        mzd_manifest_key=${mzd_manifest_line%%=*}
        mzd_manifest_value=${mzd_manifest_line#*=}
        case "$mzd_manifest_key" in
            contract_version|id|name|description|version|type|group|firmware|entrypoint|actions|target|oem_backup_md5|lock_group|status_scope|reboot_required|requires|conflicts|progress|confirmation|refresh_all|reset_entrypoint|settings|setting.*|shim_service|shim_asset|shim_path|shim_extra_targets|shim_checks|components|contributors|payload_dir|gui_api|gui_menu_path|gui_label|gui_entrypoint|gui_resident|gui_service|gui_translations|preflight|config.*) ;;
            *) mzd_manifest_error "Unknown field: $mzd_manifest_key"; return 1 ;;
        esac
        case "$mzd_manifest_seen" in *" $mzd_manifest_key "*) mzd_manifest_error "Duplicate field: $mzd_manifest_key"; return 1 ;; esac
        mzd_manifest_seen="$mzd_manifest_seen$mzd_manifest_key "
        case "$mzd_manifest_key" in
            config.*) CONFIGS=1; mzd_manifest_configs=1 ;;
            payload_dir) PAYLOAD_DIR=$mzd_manifest_value ;;
            gui_resident) [ -n "$mzd_manifest_value" ] || { mzd_manifest_error 'GUI resident path cannot be empty.'; return 1; }; GUI_RESIDENT=$mzd_manifest_value ;;
            gui_translations) [ -n "$mzd_manifest_value" ] || { mzd_manifest_error 'GUI translation path cannot be empty.'; return 1; }; GUI_TRANSLATIONS=$mzd_manifest_value ;;
            gui_service) [ -n "$mzd_manifest_value" ] || { mzd_manifest_error 'GUI service path cannot be empty.'; return 1; }; GUI_SERVICE=$mzd_manifest_value ;;
            gui_api) GUI_API=$mzd_manifest_value ;;
            gui_menu_path) GUI_MENU_PATH=$mzd_manifest_value ;;
            gui_label) GUI_LABEL=$mzd_manifest_value ;;
            gui_entrypoint) GUI_ENTRYPOINT=$mzd_manifest_value ;;
            components) COMPONENTS=$mzd_manifest_value ;;
            shim_service) SHIM_SERVICE=$mzd_manifest_value ;;
            shim_asset) SHIM_ASSET=$mzd_manifest_value ;;
            shim_path) SHIM_PATH=$mzd_manifest_value ;;
            shim_extra_targets) SHIM_EXTRA_TARGETS=$mzd_manifest_value ;;
            shim_checks) SHIM_CHECKS=$mzd_manifest_value ;;
            settings) SETTINGS=$mzd_manifest_value; mzd_manifest_settings=1 ;;
            setting.*) mzd_manifest_settings=1 ;;
            contract_version) CONTRACT_VERSION=$mzd_manifest_value ;;
            id) ID=$mzd_manifest_value ;;
            name) NAME=$mzd_manifest_value ;;
            description) DESCRIPTION=$mzd_manifest_value ;;
            version) VERSION=$mzd_manifest_value ;;
            type) TYPE=$mzd_manifest_value ;;
            group) GROUP=$mzd_manifest_value ;;
            firmware) FIRMWARE=$mzd_manifest_value ;;
            entrypoint) ENTRYPOINT=$mzd_manifest_value ;;
            actions) ACTIONS=$mzd_manifest_value ;;
            target) APP=$mzd_manifest_value ;;
            oem_backup_md5) ORIGINAL=$mzd_manifest_value ;;
            lock_group) LOCK_GROUP=$mzd_manifest_value ;;
            status_scope) STATUS_SCOPE=$mzd_manifest_value ;;
            reboot_required) REBOOT_REQUIRED=$mzd_manifest_value ;;
            requires) REQUIRES=$mzd_manifest_value ;;
            conflicts) CONFLICTS=$mzd_manifest_value ;;
            progress) PROGRESS=$mzd_manifest_value ;;
            confirmation) CONFIRMATION=$mzd_manifest_value ;;
            refresh_all) REFRESH_ALL=$mzd_manifest_value ;;
            reset_entrypoint) RESET_ENTRYPOINT=$mzd_manifest_value ;;
            preflight) PREFLIGHT=$mzd_manifest_value ;;
        esac
    done < "$mzd_manifest_file"
    for mzd_manifest_key in contract_version id name description version type group firmware entrypoint actions status_scope reboot_required requires conflicts; do
        case "$mzd_manifest_seen" in *" $mzd_manifest_key "*) ;; *) mzd_manifest_error "Missing field: $mzd_manifest_key"; return 1 ;; esac
    done
    [ "$CONTRACT_VERSION" = 1 ] && [ "$ENTRYPOINT" = run.sh ] || { mzd_manifest_error 'Unsupported contract or entrypoint.'; return 1; }
    mzd_manifest_id "$ID" && mzd_manifest_id "$GROUP" || { mzd_manifest_error 'Invalid ID or group.'; return 1; }
    [ -n "$NAME" ] && [ -n "$DESCRIPTION" ] || { mzd_manifest_error 'Name and description are required.'; return 1; }
    printf '%s\n' "$VERSION" "$FIRMWARE" | awk '!/^[0-9]+\.[0-9]+\.[0-9]+$/ {bad=1} END {exit bad}' || {
        mzd_manifest_error 'Version and firmware must have three numeric components.'; return 1;
    }
    case "$TYPE:$ACTIONS" in
        'command:run status') ;;
        'patch:install uninstall status'|'service:install uninstall status'|'files:install uninstall status'|'gui-extension:install uninstall status') ;;
        *) mzd_manifest_error 'Type/actions do not match.'; return 1 ;;
    esac
    case "$STATUS_SCOPE" in target-patch|configuration|payload|service-health) ;; *) mzd_manifest_error 'Invalid status scope.'; return 1 ;; esac
    case "$REBOOT_REQUIRED" in true|false) ;; *) mzd_manifest_error 'Expected true or false for reboot_required.'; return 1 ;; esac
    printf '%s\n' "$REQUIRES" "$CONFLICTS" | awk '!/^[a-z0-9 -]*$/ {bad=1} END {exit bad}' || {
        mzd_manifest_error 'Invalid dependency list.'; return 1;
    }
    for mzd_manifest_dependency in $REQUIRES $CONFLICTS; do
        mzd_manifest_id "$mzd_manifest_dependency" || { mzd_manifest_error 'Invalid dependency ID.'; return 1; }
    done
    for mzd_manifest_list in "$REQUIRES" "$CONFLICTS"; do
        mzd_manifest_list_seen=' '
        for mzd_manifest_dependency in $mzd_manifest_list; do
            case "$mzd_manifest_list_seen" in *" $mzd_manifest_dependency "*) mzd_manifest_error 'Duplicate dependency ID.'; return 1 ;; esac
            mzd_manifest_list_seen="$mzd_manifest_list_seen$mzd_manifest_dependency "
        done
    done
    case "$PROGRESS" in true|false) ;; *) mzd_manifest_error 'Expected true or false for progress.'; return 1 ;; esac
    case "$REFRESH_ALL" in true|false) ;; *) mzd_manifest_error 'Expected true or false for refresh_all.'; return 1 ;; esac
    case "$PREFLIGHT" in true|false) ;; *) mzd_manifest_error 'Expected true or false for preflight.'; return 1 ;; esac
    case "$RESET_ENTRYPOINT" in ''|reset.sh) ;; *) mzd_manifest_error 'Reset entrypoint must be reset.sh.'; return 1 ;; esac
    if [ "$mzd_manifest_settings" = 1 ]; then
        mzd_manifest_schema="${mzd_manifest_file%/*}/../../lib/settings.awk"
        [ -f "$mzd_manifest_schema" ] && [ ! -L "$mzd_manifest_schema" ] || { mzd_manifest_error 'Settings schema reader is missing.'; return 1; }
        mzd_manifest_settings_error=$(awk -v mode=validate -f "$mzd_manifest_schema" "$mzd_manifest_file") || {
            printf '%s\n' "${mzd_manifest_settings_error:-Manifest: Settings cannot be validated.}" >&2; return 1;
        }
    fi
    if [ -n "$SHIM_ASSET$SHIM_PATH$SHIM_SERVICE$SHIM_EXTRA_TARGETS$SHIM_CHECKS" ]; then
        [ "$TYPE:$RESET_ENTRYPOINT:$REBOOT_REQUIRED" = files:reset.sh:true ] || { mzd_manifest_error 'Shims require files, reset.sh and reboot_required=true.'; return 1; }
        printf '%s\n' "$SHIM_SERVICE" | awk '!/^[A-Za-z0-9_.-]+$/ {exit 1}' || { mzd_manifest_error 'Invalid shim service name.'; return 1; }
        case "$SHIM_ASSET" in assets/*.so) ;; *) mzd_manifest_error 'Shim asset must be an assets/*.so file.'; return 1 ;; esac
        printf '%s\n' "$SHIM_ASSET" "$SHIM_PATH" | awk '!/^[A-Za-z0-9_.\/-]+$/ || /(^|\/)\.\.?($|\/)/ {bad=1} END {exit bad}' || { mzd_manifest_error 'Unsupported shim path.'; return 1; }
        case "$SHIM_PATH" in /tmp/mnt/data_persist/mzd-tweaks/shims/"$ID"/*.so) ;;
            *) mzd_manifest_error 'Shim destination must be inside this tweak persistent shim folder.'; return 1 ;;
        esac
        case "${SHIM_PATH##*/}" in ''|.*) mzd_manifest_error 'Invalid shim filename.'; return 1 ;; esac
        case "${SHIM_PATH%/*}" in */shims/"$ID") ;; *) mzd_manifest_error 'Nested shim directories are unsupported.'; return 1 ;; esac
        printf '%s\n' "$SHIM_EXTRA_TARGETS" "$SHIM_CHECKS" | awk -v primary="$APP" '
          {
            n=split($0,records," "); if((NR==1 && n>7) || (NR==2 && n>16))bad=1
            for(i=1;i<=n;i++) {
              if(split(records[i],pair,":")!=2 || pair[1]!~/^\/[A-Za-z0-9_.\/-]+$/ || pair[1]~/\/\.\.?($|\/)/ || pair[2]!~/^[0-9a-f]+$/ || length(pair[2])!=32 || seen[NR,pair[1]]++)bad=1
              if(NR==1 && pair[1]==primary)bad=1
            }
          }
          END {exit bad}
        ' || { mzd_manifest_error 'Invalid, duplicate or excessive shim path:OEM-MD5 records.'; return 1; }
        printf '%s\n' "$APP" | awk '!/^\/[A-Za-z0-9_.\/-]+$/ || /\/\.\.?($|\/)/ {exit 1}' || { mzd_manifest_error 'Unsupported shim loader target.'; return 1; }
    fi
    LOCK=
    if [ "$TYPE" = gui-extension ]; then
        case "$ID" in games|exit) mzd_manifest_error 'Reserved GUI extension ID.'; return 1 ;; esac
        [ "$GUI_API:$RESET_ENTRYPOINT:$REBOOT_REQUIRED:$STATUS_SCOPE" = 1:reset.sh:true:payload ] &&
            [ -z "$APP$ORIGINAL$LOCK_GROUP$COMPONENTS$SHIM_ASSET" ] || { mzd_manifest_error 'GUI extensions require API 1, reset.sh, payload, restart and no patch metadata.'; return 1; }
        printf '%s\n' "$GUI_MENU_PATH" | LC_ALL=C awk -F/ 'length($0)>240 || NF>8 {bad=1} $0!="" {for(i=1;i<=NF;i++)if($i=="" || $i=="." || $i==".." || length($i)>80 || $i~/^[[:space:]]|[[:space:]]$/)bad=1} END {exit bad}' || { mzd_manifest_error 'Invalid GUI menu path (maximum eight segments, 240 characters).'; return 1; }
        [ -n "$GUI_LABEL" ] && [ "${#GUI_LABEL}" -le 80 ] || { mzd_manifest_error 'GUI label must contain 1-80 characters.'; return 1; }
        printf '%s\n' "$GUI_ENTRYPOINT" | awk '!/^assets\/[A-Za-z0-9_.\/-]+[.]html$/ || /(^|\/)\.\.?($|\/)/ {exit 1}' || { mzd_manifest_error 'GUI entrypoint must be an assets/*.html path.'; return 1; }
        for capability in "$GUI_RESIDENT" "$GUI_SERVICE" "$GUI_TRANSLATIONS"; do
            [ -n "$capability" ] || continue
            printf '%s\n' "$capability" | awk '!/^assets\/[A-Za-z0-9_.\/-]+[.](js|lua|json)$/ || /(^|\/)\.\.?($|\/)/ {exit 1}' || { mzd_manifest_error 'Invalid GUI capability path.'; return 1; }
        done
        case "$GUI_RESIDENT" in ''|*.js) ;; *) mzd_manifest_error 'GUI resident must be JavaScript.'; return 1 ;; esac
        case "$GUI_SERVICE" in ''|*.lua) ;; *) mzd_manifest_error 'GUI service must be Lua.'; return 1 ;; esac
        [ -z "$GUI_SERVICE" ] || [ -n "$GUI_RESIDENT" ] || { mzd_manifest_error 'A GUI service requires a resident controller.'; return 1; }
        case "$GUI_TRANSLATIONS" in ''|*.js) ;; *) mzd_manifest_error 'GUI translations must be JavaScript.'; return 1 ;; esac
        LOCK=/tmp/mzd-gui-extension.lock
    elif [ -n "$GUI_API$GUI_MENU_PATH$GUI_LABEL$GUI_ENTRYPOINT$GUI_RESIDENT$GUI_SERVICE$GUI_TRANSLATIONS" ]; then
        mzd_manifest_error 'GUI metadata requires gui-extension type.'; return 1
    fi
    if [ "$TYPE" != command ] && [ "$TYPE" != gui-extension ]; then
        case "$APP" in /*) ;; *) mzd_manifest_error 'An absolute target is required.'; return 1 ;; esac
        case "$ORIGINAL" in ''|*[!0-9a-f]*) mzd_manifest_error 'Invalid OEM backup checksum.'; return 1 ;; esac
        [ "${#ORIGINAL}" = 32 ] || { mzd_manifest_error 'Expected a 32-character OEM backup checksum.'; return 1; }
        case "$LOCK_GROUP" in ''|*[!A-Za-z0-9_-]*) mzd_manifest_error 'Invalid lock group.'; return 1 ;; esac
        LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"
    fi
    if [ "$mzd_manifest_configs" = 1 ];then
        mzd_config_schema="${mzd_manifest_file%/*}/../../lib/configs.awk"
        mzd_config_result=$(awk -v mode=validate -f "$mzd_config_schema" "$mzd_manifest_file") || { mzd_manifest_error "$mzd_config_result";return 1; }
    fi
    [ -z "$CONFIGS" ] || [ "$TYPE" != command ] || { mzd_manifest_error 'Command tweaks cannot own persistent config.';return 1; }
    if [ -n "$COMPONENTS" ]; then
        [ "$COMPONENTS:$TYPE:$RESET_ENTRYPOINT:$REBOOT_REQUIRED:$LOCK_GROUP" = components.tsv:files:reset.sh:true:sm-config ] || { mzd_manifest_error 'Components require components.tsv, files, reset.sh, restart and sm-config lock.'; return 1; }
        [ -z "$SHIM_ASSET$SHIM_PATH$SHIM_SERVICE$SHIM_EXTRA_TARGETS$SHIM_CHECKS" ] || { mzd_manifest_error 'Use either components or single-shim metadata.'; return 1; }
        if [ -n "${PAYLOAD_DIR:-}" ]; then
            case "$PAYLOAD_DIR" in
                /tmp/mnt/data_persist/*) ;;
                *) mzd_manifest_error 'Payload directory must be under persistent storage.'; return 1 ;;
            esac
            case "$PAYLOAD_DIR" in
                */*/*/*) ;;
                *) mzd_manifest_error 'Payload directory cannot be the root storage directory.'; return 1 ;;
            esac
            case "$PAYLOAD_DIR" in
                *[!A-Za-z0-9_./-]*) mzd_manifest_error 'Invalid characters in payload directory.'; return 1 ;;
                */.|*/..|*/./*|*/../*|*//*) mzd_manifest_error 'Payload directory cannot contain relative elements.'; return 1 ;;
            esac
        fi
        . "${mzd_manifest_file%/*}/../../lib/components.sh" || return 1
        mzd_components validate || return 1
    fi
}
