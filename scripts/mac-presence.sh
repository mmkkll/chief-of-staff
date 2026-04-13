#!/bin/bash
# Prints "present" if the user is at the Mac, "absent" otherwise.
# "Present" = screensaver not running AND HID idle time < 600s (10 min).
# Used by the morning briefing cron to decide whether to speak the brief aloud.

set -e

if pgrep -q ScreenSaverEngine 2>/dev/null; then
  echo "absent"
  exit 0
fi

# HID idle time in nanoseconds → seconds
idle_ns=$(ioreg -c IOHIDSystem -r 2>/dev/null | awk '/HIDIdleTime/ {gsub("[^0-9]","",$NF); print $NF; exit}')
if [ -z "$idle_ns" ]; then
  echo "absent"
  exit 0
fi
idle_sec=$(( idle_ns / 1000000000 ))

if [ "$idle_sec" -lt 600 ]; then
  echo "present"
else
  echo "absent"
fi
