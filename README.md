# Deadzone Custom Unit Builder

Unofficial custom unit points estimator for Deadzone-style profiles.

This is a static GitHub Pages app. It contains only derived model weights and
does not include official unit lists, official profiles, or rule descriptions.

## Local Use

Run a simple local server from this folder:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Opening `index.html` directly from disk is not supported because browsers block
some local file loads. Use GitHub Pages or a local server.

## GitHub Pages

In GitHub:

1. Open repo settings.
2. Go to Pages.
3. Select `Deploy from a branch`.
4. Use branch `main` and folder `/root`.

## Model

The app uses derived calibration files in `model/`:

- `base_model.csv`
- `multiplier_model.csv`
- `rounding_model.csv`
- `vp_model.csv`
- `model_meta.json`

The private calibration workflow lives separately and should stay private.

## Parity Tests

Run the app/model parity check before deploying:

```powershell
npm test
```

For a full private calibration-list check, first generate the local fixture from
the private calibration repo:

```powershell
npm run fixtures:parity
npm test
```

`test/private-parity-fixtures.json` is ignored by git so the public repo does
not publish private calibration rows. If that file is missing, `npm test` uses a
small public sample fixture instead.
