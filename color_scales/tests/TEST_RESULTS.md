# Validation run

- Python: 3.14, clean installed `requirements.txt` set.
- Live full CLI: all five recovered; four NASA standalone PNG assets, one NASA
  primary-video legend crop. Final `--force` command ran with fixture frame.
- Unit/integration suite: **19 tests passed**, including five actual NASA
  fixture classes (precipitation separately liquid/frozen, CO, NOx, temperature,
  active fires), synthetic geometry, corrupt/missing files, JSON generation,
  discovery, CO corrected category, and independence from Agent 1.
- Scientific audit: page titles confirmed quantities; SVS 5115 is CO2 while the
  extracted CO is SVS 5153. No official machine-readable RGB/value lookup found;
  all interpretations are estimated, not verified.
- Use `python -m unittest discover -s color_scales/tests -v` to reproduce without
  live network access. Test source HTML is under `source_evidence/`.
