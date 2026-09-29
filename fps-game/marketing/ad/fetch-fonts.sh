#!/bin/sh
# Game fonts (SIL Open Font License) used for the ad's title cards.
set -e
cd "$(dirname "$0")"
mkdir -p fonts
curl -sL -o fonts/LuckiestGuy.ttf https://fonts.gstatic.com/s/luckiestguy/v25/_gP_1RrxsjcxVyin9l9n_j2RSg.ttf
curl -sL -o fonts/Bangers.ttf https://fonts.gstatic.com/s/bangers/v25/FeVQS0BTqb0h60ACL5k.ttf
curl -sL -o fonts/Fredoka700.ttf https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OFiXMFg.ttf
