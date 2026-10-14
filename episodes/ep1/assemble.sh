#!/usr/bin/env bash
# Combine rendered frames + soundtrack into the final vertical video.
#   ./assemble.sh <frames_dir> <soundtrack.wav> <out.mp4>
set -euo pipefail
FRAMES=${1:?frames dir}
AUDIO=${2:?soundtrack wav}
OUT=${3:?output mp4}
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

# title card fades in/out over the establishing shot; "to be continued" at the end
TITLE="drawtext=fontfile=$FONT:text='SAKADUNG TOILET':fontsize=86:fontcolor=white:borderw=6:bordercolor=black:x=(w-tw)/2:y=210:alpha='if(lt(t,0.4),0,if(lt(t,0.9),(t-0.4)/0.5,if(lt(t,2.8),1,if(lt(t,3.3),(3.3-t)/0.5,0))))'"
VS="drawtext=fontfile=$FONT:text='vs':fontsize=60:fontcolor=0xFFD23C:borderw=5:bordercolor=black:x=(w-tw)/2:y=315:alpha='if(lt(t,0.6),0,if(lt(t,1.1),(t-0.6)/0.5,if(lt(t,2.8),1,if(lt(t,3.3),(3.3-t)/0.5,0))))'"
APPLE="drawtext=fontfile=$FONT:text='AGENT APPLE':fontsize=86:fontcolor=0xFF3B30:borderw=6:bordercolor=black:x=(w-tw)/2:y=395:alpha='if(lt(t,0.8),0,if(lt(t,1.3),(t-0.8)/0.5,if(lt(t,2.8),1,if(lt(t,3.3),(3.3-t)/0.5,0))))'"
EP="drawtext=fontfile=$FONT:text='EPISODE 1':fontsize=44:fontcolor=white:borderw=4:bordercolor=black:x=(w-tw)/2:y=505:alpha='if(lt(t,1.0),0,if(lt(t,1.5),(t-1.0)/0.5,if(lt(t,2.8),1,if(lt(t,3.3),(3.3-t)/0.5,0))))'"
TBC="drawtext=fontfile=$FONT:text='TO BE CONTINUED...':fontsize=64:fontcolor=white:borderw=6:bordercolor=black:x=(w-tw)/2:y=h-300:enable='gte(t,29.0)'"

ffmpeg -y -loglevel error -stats \
  -framerate 24 -i "$FRAMES/f_%04d.png" -i "$AUDIO" \
  -filter_complex "[0:v]scale=1080:1920:flags=lanczos,eq=contrast=1.06:saturation=1.12,vignette=PI/5,noise=alls=3:allf=t,$TITLE,$VS,$APPLE,$EP,$TBC,format=yuv420p[v]" \
  -map "[v]" -map 1:a -c:v libx264 -preset slow -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
