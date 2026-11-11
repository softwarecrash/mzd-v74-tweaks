# DriveDash data model v1

Every design receives `draw(ctx, model, t)`. The first BM design uses compact
aliases such as `model.speed`, `model.battery` and `model.fuel`. New designs can
use the complete, design-independent API:

- `model.data`: numeric values in canonical units, or `null` when unavailable.
- `model.formatted[key]`: localized, unit-converted text without a suffix;
  unavailable values are `--`.
- `model.units[key]`: the unit label for that formatted value.
- `DriveDashData.fields`: `{key, unit, labelKey}` descriptors for all numeric
  fields. Use `t(field.labelKey)` for their shared English/German labels.

```js
var field = 'intakeC';
ctx.fillText(t('data.'+field), 120, 100);
ctx.fillText(model.formatted[field]+' '+model.units[field], 120, 125);
```

Do not calculate vehicle scaling or statistics inside a skin. `data.js` owns
normalization and view-local statistics; `model.js` owns formatting and units.
The collector owns read-only vehicle access. Installed code never substitutes
demo values when a sensor is missing.

## Canonical numeric fields

| Fields | Canonical units / source |
| --- | --- |
| `speedKph`, `rpm` | km/h and RPM, SMDB |
| `outsideC`, `coolantC`, `intakeC` | Celsius; SMDB raw minus 40 |
| `tripKm` | km; `vdm/PID_Drv1Dstnc_curr` raw × 0.02 |
| `avgL100` | L/100 km; `vdm_vdt_history_data/TotAvlFuelE`, 1000/raw |
| `driveAvgL100` | L/100 km; `vdm/Drv1AvlFuelE`, 1000/raw |
| `cumulativeAvgL100` | L/100 km; `vdm_history_data/HVD_CumAvgFuelEff_curr`, 10000/raw |
| `fuelRaw`, `fuelPercent` | raw fuel gauge and approximate percent, legacy maximum 184 |
| `engineLoadPercent`, `batteryPercent` | percent; EngineLoad directly, battery SOC raw/2 |
| `gearNumber`, `leverPosition` | distinct raw codes: gears 1..6, lever 1=P, 2=R, 3=N, 4=D |
| `gpsSpeedKph`, `gpsAltitudeM` | km/h and metres, LDS GetPosition |
| `gpsLatitudeDeg`, `gpsLongitudeDeg`, `gpsHeadingDeg` | reported degrees, LDS GetPosition |
| `topSpeedKph`, `maxRpm`, `movingAvgKph` | view-session maximum speed/RPM and time-weighted moving average |
| `elapsedSeconds`, `movingSeconds` | observed active sampling time and moving time, seconds |
| `speedObservedSeconds` | seconds with valid fresh speed at both interval endpoints |
| `idleSeconds`, `engineIdleSeconds` | stationary time, and stationary time with RPM > 0 |
| `idlePercent`, `engineIdlePercent` | proportion of valid speed observations, or valid speed-and-RPM observations, respectively |
| `gpsMinAltitudeM`, `gpsMaxAltitudeM` | min/max reported altitude during the view session; negative/zero heights are valid |

The additional string `data.gear` combines lever/gear as before. Unknown zero
gear codes do not assert neutral. Missing fields are `null`; zero is a valid
reading for speed, RPM, load and battery. Battery 254/255 are unavailable.

Automatic/manual unit settings are shared: mph also selects miles, feet and US
mpg; temperature is independent. Canonical values always remain metric. Durations
are formatted as `m:ss` or `h:mm:ss`. No field changes language independently.

## Sampling and lifecycle

Speed and RPM are read on every new sample; one secondary slot rotates through
the other fields. GPS occupies one slot, with one LDS query supplying all five
GPS fields. All commands use the existing process runner and a one-second
deadline. Requests within 500 ms reuse the sample. Two failed reads retain the
last good field; the third removes it. No new reads run when the view is closed
or showing settings, and the collector invalidates its cache after ten idle
seconds. Additional fields lengthen the secondary-field rotation; they do not
create parallel processes or polling loops.

Collector metadata contains `schemaVersion`, monotonic `sampleSeconds`,
`sequence` and per-sample `fresh` flags. Reused samples have the same sequence.
Statistics consume only fresh speed/RPM, ignore duplicate samples and intervals
over five seconds, and stop integrating across settings pauses. The moving
average uses elapsed time and trapezoidal integration, not a sample count.
Moving/idle intervals require matching valid states at both endpoints; transition
intervals do not count toward either. Percent denominators include known
transition intervals. Maxima/minima survive a settings visit, but reset when
the view is reopened. No background recording or persistent trip history exists.

## Open vehicle checks

- **tripKm:** compare the counter against the Mazda trip display while driving,
  across ignition cycles and counter resets. It is not yet a verified Trip A/B
  reading. No reset accumulation or invented distance has been added.
- GPS typed reply layout, speed units and heading reference follow the old
  integration and require real-CMU verification. `gpsHeadingReference` is `oem`;
  `gpsFixValid` remains `null`; driving direction uses the separate GPS-course calculation below. The legacy source used different
  heading offsets depending on Nav SD, and a coordinate alone proves no fix.
- Validate additional consumption counters, battery SOC and engine load against
  a real vehicle. Their scaling follows the old speedometer reference.

Do not call `driveAvgL100` instantaneous consumption: the original source is a
drive-average counter. Independently collected/cumulative averages may differ.

## Driving compass

`gpsCourseDeg` is the initial great-circle bearing between fresh GPS positions,
clockwise from true north. `gpsDirection` is its nearest eight-point direction.
It does not assume a reference for the raw OEM `gpsHeadingDeg`, which remains
unchanged. The view session requires vehicle speed of at least 3 km/h, movement
of at least 3 metres, and samples no more than 5 seconds apart. Missing positions,
implausible jumps, stopping and pausing clear the course. This is driving course,
not a magnetic heading or proof of GPS fix quality. The simulator supplies an
explicitly simulated course. Classic rotates its cardinal ring using this field
and shows no cardinal direction when it is unavailable. Real driving verification
of GPS position quality is still required. No additional CMU query is used.
