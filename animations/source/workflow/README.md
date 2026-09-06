Cleric casting animation

Open index.html in any modern browser. It is self-contained and works offline.
Play/pause, frame selection, arrow-key stepping, speed and background controls are included.

Assets: eight transparent 64×48 PNG frames, a 4-column × 2-row sprite sheet,
an enlarged contact sheet, a looping GIF, and animation.json with frame timings.
PNG frames and sheet use the source's exact 13 opaque colors with binary transparency.
The input is a 45×38 logical sprite enlarged 6×. First and last poses reproduce it exactly,
offset by (8,8) in the new canvas. The original file is also included, unchanged.

Process: a built-in image-generation draft was created to explore eight casting poses.
It changed equipment details, so it was not used as the final pixel asset. Final frames
are deterministic nearest-neighbor transforms of the original body, shield, arm/staff,
and feet, with a small spell effect drawn using source colors. This retains source
identity, although rigid rotation of a coarse pixel cluster can change its edge shape.

Animation direction / generation prompt summary: eight evenly spaced casting frames;
neutral, brace, lift, charge, release, follow through, recovery, settle; right-facing
cleric; constant robe, cowl, stole, shield and staff; fixed palette; no antialiasing;
a gold-and-cream spell grows from the staff head and travels right.

Potential improvement: Aseprite or LibreSprite with layer-aware editing and onion
skinning would make manual elbow, sleeve and rotated-staff contour cleanup easier.
No additional tools are required to use these deliverables. Image generation alone
did not reliably preserve exact pixel-grid and equipment continuity.

The hosted Sites setup could not fetch its required package due to a network restriction.
The supplied standalone page requires no packages or network access.
