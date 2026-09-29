#!/bin/bash
# run.sh stills "1,5,9"   |   run.sh video <upload_url>
set -e
cd "$(dirname "$0")"
python3 build.py
(python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1
if [ "$1" = stills ]; then node render.js stills "$2"; python3 sheet.py; exit 0; fi
N=$(python3 -c "import json;print(round(json.load(open('tl.json'))['DUR']*30))")
K=${K:-7}; rm -f list.txt
for k in $(seq 0 $((K-1))); do node render.js video $((N*k/K)) $((N*(k+1)/K)) seg$k.mp4 & echo "file 'seg$k.mp4'" >> list.txt; done; wait
ffmpeg -y -v error -f concat -safe 0 -i list.txt -c copy video.mp4
python3 mix.py
ffmpeg -y -v error -i video.mp4 -i final.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out.mp4
ls -la out.mp4
[ -n "$2" ] && curl -sS -f -X PUT -H "Content-Type: video/mp4" --upload-file out.mp4 "$2" && echo UPLOADED
