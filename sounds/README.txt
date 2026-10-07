Sound files used by the app. All are CC0 (see SoundCredits.txt).

  place_1..4.wav   card set down (also cards sent to a foundation)
  slide_1..4.wav   draw from the stock
  tick.wav         the quiet lazy-move note
  win.wav          the short win jingle
  music_1.mp3, music_2.mp3   optional quiet piano music (off until turned on in Settings)

To add or change sounds: put files here with those names, run  python3 tools/make_sound_manifest.py
then raise VERSION in sw.js so the files are cached again for offline play.
