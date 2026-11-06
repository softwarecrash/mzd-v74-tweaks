# DriveDash real-car readings and 0.1.1 correction

- Date: 2026-11-06 (Europe/Berlin)
- Source: feature/issue-62-speedometer working tree
- Type: physical vehicle read-only diagnostics; fixed collector integration emulated separately
- Firmware: 74.00.324, CMU150
- Transmission: manual (owner corrected an earlier automatic selection)
- Conditions: engine running, vehicle stationary; no gear engaged was not independently verified

| Native field | Raw reading | Interpretation / evidence |
| --- | --- | --- |
| VehicleSpeed | 0 | stationary |
| EngineSpeed | 353 | 706 RPM |
| Out-CarTemperature | 42 | 2 Celsius |
| EngClnt_Te_Actl | 105 | 65 Celsius |
| TransmissionGearPosition / TransmChangeLeverPosition | 0 / 0 | unavailable, not proof of neutral |
| PID_Drv1Dstnc_curr / Drv1AvlFuelE | 0 / 0 | current trip counters not useful for stored average |
| TotAvlFuelE | 141 | about 7.1 L/100 km; owner dashboard reported 7.2 |
| FuelGaugePosition | 91, then 92 | owner gauge slightly below half; reference bars only |

Successful raw command roundtrips measured 167-316 ms. The former 250 ms deadline
could reject healthy reads. The corrected collector uses one second and clears
a good field only after three consecutive failures. Slow fields are retried
promptly. A longer idle gap resets the cache. The display transport also tolerates
two failures and clears on the third. Independent original ARM Lua/HTTP tests
verify these changes; no corrected on-car application run is claimed yet.

Explicit per-command LD_LIBRARY_PATH resolves the JCI libraries even when the
launch environment lacks them. No production shared service, OEM binary, SSH or
system configuration was changed during raw-value collection. Full fuel
calibration, moving gear signals and driving dynamics remain unverified.
