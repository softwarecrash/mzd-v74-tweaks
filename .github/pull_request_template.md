## Change

Describe the problem and resulting behaviour. Link the issue, if applicable.

## Scope

- Tweak/component:
- Affected CMU files or services:
- Shared-file interactions / uninstall behaviour:

## Validation

List commands and results. Distinguish static checks, isolated tests, emulation
and vehicle tests. For vehicle evidence include firmware/region, installation,
reboot and uninstall results; say explicitly what remains unverified.

- Repository checks:
- Relevant behaviour tests:
- Vehicle evidence / remaining limitations:

## Review checks

- [ ] One focused feature or shared-infrastructure change; unrelated cleanup omitted.
- [ ] Shared configuration checks pass; required checksums match intentional changes.
- [ ] Protected OEM/payload bytes were preserved or intentional changes are explained.
- [ ] Failure, rollback and shared-file behaviour were checked where applicable.
- [ ] Documentation and package contents match the final change.
