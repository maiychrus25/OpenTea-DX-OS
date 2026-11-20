Short videos

Demo clips for the "Video ngắn" section of the account pages: `short-1.mp4` ... `short-12.mp4`, each with a poster
`short-N.jpg` (its first frame). Vertical 540 x 960, 6 seconds, H.264 baseline, no sound, about 200-350 KB each.

They are not filmed: each one is a slow zoom or pan over one of the app's own pictures (`assets/images/hero.jpg`,
`dest.jpg`, `hero2.jpg` and `products/prod-01..05.jpg`), made with ffmpeg, for example:

    ffmpeg -loop 1 -i ../images/hero.jpg -t 6 \
      -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0012,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=540x960:fps=25,format=yuv420p" \
      -c:v libx264 -profile:v baseline -crf 30 -movflags +faststart -an short-1.mp4

They are meant to be replaced by real clips from the households, the cooperatives and the tour company.
