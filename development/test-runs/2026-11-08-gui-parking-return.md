# GUI return after camera and parking interruption

Firmware: 74.00.324 EU, real vehicle CMU.
Scope: shared GUI helper 0.5.1, parking-lifecycle=1; DriveDash used for visual acceptance.

Before the change, reverse camera and parking sensor displays closed DriveDash. Logs identified backupparking contexts BackupCameraDisplay, BUCAndPSMDisplay and ParkingSensorDisplay, followed by the original Applications context sequence.

The updated helper was copied to USB, installed by the user and tested in the vehicle. The user confirmed successful return after the camera/parking interruption.

The shared behavior applies to views that opt into suspend/resume. Games use the same API, but were not separately tested against the physical reversing camera in this session. No changes to OEM camera files or vehicle signals were made.
