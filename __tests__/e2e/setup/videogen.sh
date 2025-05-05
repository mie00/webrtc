#!/bin/bash

# Parameters
width=640
height=480
frames=100
qr_size=100
output="camera.mjpeg"
bg_color="white"

# Create working directory
mkdir -p frames

# Generate QR code
qrencode -o qr.png -s 10 "book"
convert qr.png -resize ${qr_size}x${qr_size} qr_resized.png

# Generate frames
for ((i=0; i<frames; i++)); do
    # Calculate x position (move from right to left)
    x=$(((i * (width - qr_size) / frames)))

    # Create a blank background
    convert -size ${width}x${height} xc:$bg_color frames/frame_$(printf "%03d" $i).jpg

    # Composite QR code onto the background
    composite -geometry +$x+$((height / 2 - qr_size / 2)) qr_resized.png frames/frame_$(printf "%03d" $i).jpg frames/frame_$(printf "%03d" $i).jpg
done

# Create MJPEG video using ffmpeg
ffmpeg -y -framerate 25 -i frames/frame_%03d.jpg -c:v mjpeg -q:v 5 -pix_fmt yuv420p $output

# Cleanup (optional)
rm -r frames qr.png qr_resized.png
