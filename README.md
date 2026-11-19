# Perea Performance iDrive apps

An app for the BMW MGU head unit on iDrive 7, installed with the
[MGU Store](https://github.com/robertnisipeanu/mgu-store). It is built on the MGU App Kit
from [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps), reduced here to what
this app uses (see `THIRD_PARTY_NOTICES.md`). The Store builds the app on the head unit itself
from this repository: no BMW SDK leaves the car, and none is in this repository.

## App

| App | Id | What it does |
|---|---|---|
| **Cluster Themes** | `perea_cluster_themes` | Redraws the whole **instrument cluster** in a theme of your choice (GT3 race dash, M, M view, Vector, Sport, Minimal, Track, Drag, Rally, Retro 80s, Cruise, Dyno, Ribbon), picked on the centre screen or by drive mode. **iDrive 7 only**, and it draws through [cluster-render](https://github.com/robertnisipeanu/idrive-apps) (0.5.1 or newer), which must be installed first. **The app is [bimmer-lab](https://github.com/bimmer-lab/apps)'s, and all credit for it goes to them**; this is a copy of their 0.19.0 (MIT) with a fix so that it installs (0.19.1, below). Themes, settings and what is verified on a car: [apps/perea_cluster_themes/README.md](apps/perea_cluster_themes/README.md); working on it: [docs/cluster-themes.md](docs/cluster-themes.md). |

![Cluster Themes, GT3](docs/images/cluster-gt3.png)

> **Cluster Themes draws over BMW's own cluster.** Its readouts are for information only: follow
> BMW's own warnings, and pick *Off* in the app to get BMW's cluster back. It only reads from the car.

**Credit.** Cluster Themes was made by [bimmer-lab](https://github.com/bimmer-lab/apps): the themes, the
centre-screen page, the drawing engine in `shared/`, the bench and the tools are their work, on
[cluster-render](https://github.com/robertnisipeanu/idrive-apps) by Robert Nisipeanu. What this repository
adds to it is small:

- **It installs (0.19.1).** bimmer-lab's 0.19.0 is refused on install by BMW's app manager (the Store's
  *install failed … generateSomeipInterfaces*,
  [their issue #26](https://github.com/bimmer-lab/apps/issues/26)): it asks for the head unit's now playing
  (`HmiMediaState`) by instance `1`, and the units name that interface's instances `HMI_CID`,
  `HMI_FoMo_Left` and `HMI_FoMo_Right`. Here the app asks for `HMI_CID`. Installed and running on an
  iDrive 7 car since 2026-11-18.
- **The build fits the app to the head unit it builds on**: what that unit's interface catalog does not
  have comes out of the app's SOME/IP manifest (`fit_to_unit()` in `kit/tools/build.py`, from
  idrive7-apps), so a signal a car lacks costs that readout and not the install.
- Its own id (`perea_cluster_themes`) and Store entry, and a start test.

## Install

Cluster Themes needs **cluster-render** (0.5.1 or newer), which the Store cannot offer by
itself: add the source `robertnisipeanu/idrive-apps` and install *Cluster renderer* from it first.
The app is listed for iDrive 7 only (its own entry in `mgu-repo.json`).

**A. From GitHub, in the Store.** Settings → **Add source** → `alexpereap/pereaperformance-idrive7-apps`,
following the **main** branch. The app appears in the Store's list; pick it and install. The
head unit builds it (the Store installs its Python tool first, once).

**B. From a USB stick, offline.** Clone the Store's repository on your computer (Node 18 or
newer, or the standalone executable from the Store's `installer` release), write the stick, and
install from the Store's **USB** page:

```sh
git clone https://github.com/robertnisipeanu/mgu-store.git
```

```sh
node mgu-store/deploy/mgu-install.js usb-repo /media/<your-stick> /path/to/pereaperformance-idrive7-apps
```

It copies this repository's tracked files to `<stick>/mgu-repo/<name>/`; the head unit builds
the app from there. Run it again after a change: the Store offers the app again only when its
`version` in `app.json` went up.

**C. A package built with your own SDK.** With `oap-sdk/` extracted from your unit (below),
`python3 kit/tools/build.py perea_cluster_themes` writes `dist/perea_cluster_themes@<version>.tgz`; put it
on the stick with `usb-repo /media/<your-stick> dist/perea_cluster_themes@<version>.tgz`. The `.mgu`
and `.tgz` files contain BMW's SDK: keep them for your own car.

## Develop

Needs Node (18 or newer on the computer; the app itself runs on the unit's Node 8, so no
`?.` or `??` in app code) and Python 3.

**The SDK from your unit** (only for installable builds; previews and tests need none):

```sh
scp root@<unit>:'/usr/lib/oap-mainapp/preinstalled_apps/x_call@*.tgz' .
mkdir x_call && tar xzf x_call@*.tgz -C x_call
node kit/tools/extract_sdk.js x_call/javascript/app.js     # writes ./oap-sdk/ (gitignored, never commit it)
```

**Build, preview, emulate, test:**

```sh
python3 kit/tools/build.py --preview-only perea_cluster_themes   # stage dist/perea_cluster_themes (no SDK)
python3 kit/tools/build.py perea_cluster_themes                  # with oap-sdk/: dist/perea_cluster_themes@<ver>.tgz and .mgu
node kit/tools/preview.js dist/perea_cluster_themes out/         # frames as PNG (demo data)
node kit/tools/emu.js perea_cluster_themes                       # the app in the browser: http://localhost:8077 (docs/emulator.md)
node kit/tools/test_cluster_themes.js                            # staged, started, its default theme on a stand-in cluster-render
node kit/tools/test_runtime.js                                   # the kit: display, renderer client, settings sheet
node kit/tools/test_start.js                                     # mgu.js's start sequence against a stand-in oap-sdk
node kit/tools/test_locales.js                                   # every language: catalogs, labels, glyphs
python3 kit/tools/test_build.py                                  # build.py output against the snapshots
python3 kit/tools/test_fit_to_unit.py                            # the build takes out of the manifest what a unit's catalog lacks
node bench/server.js                                             # the cluster in the browser: http://localhost:8078 (bench/README.md)
```

`build.py` with no app id builds every app in `apps/`.

## Adding an app

1. `apps/<id>/app.json` and `main.js`: the id lower-case with the `perea_` prefix (the Store
   wants ids unique across sources), a `loggingId` of its own, `version` x.y.z. An ordinary app
   uses `mgu.run({ start(ctx) })`, `ctx.loop`, `ctx.canvas`, `G.radial` and the generated
   Settings screen. Cluster Themes is the example here: a canvas page (`shared/page.js`) and a
   cluster engine (`shared/hud.js`), both listed in `app.json` `"shared"`.
2. `apps/<id>/icon.png` (the Store shows it; 128 KiB at most):
   `node kit/tools/make_icon.js <glyph> apps/<id>/icon.png`.
3. Its test in `kit/tools/`, run from `.github/workflows/tests.yml`.
4. Nothing to change in `mgu-repo.json`: every folder in `apps/` with an `app.json` is an app,
   for iDrive 7 and 8, needing a renderer. An app that differs (Cluster Themes: iDrive 7 only, no
   renderer needed) is named in the pattern's `exclude` and has its own entry under `components`.
   A kit module the app needs that is not here yet is taken from upstream idrive7-apps, with its
   notice. Code more than one app can use goes in `shared/`; an app names the files it needs in
   `app.json` `"shared"` and the build copies them in.

## Translations

The packages are fixed-language: English, or Korean (`ko`), Russian (`ru`), Chinese (`zh-CN`)
with `--language`. The catalogs are `kit/runtime/locales/<lang>.tsv` (`English<TAB>translation`,
the key is the exact English text; every `app.json` label with a space must have a row) and
hold only the rows the app shows. Cluster Themes is English only (`"locales": ["en"]`): its
labels need no rows, and a package of it in another language shows them in English. The catalogs
carry the kit's own text.

1. Add the rows to the three TSVs, then `python3 kit/tools/sync_locales.py` (writes the JSON).
2. `python3 kit/tools/prune_locales.py --check` must pass (a row nothing shows is refused;
   `prune_locales.py` without `--check` drops it). Strings the kit draws by itself are on the
   script's `KEEP` list.
3. New characters need their glyphs baked: `python3 kit/tools/bake_cjk.py` for Chinese
   (downloads Noto Sans SC, checksum verified; Pillow needed), `python3 kit/tools/bake_korean.py`
   for Korean (Noto Sans CJK KR installed). The Latin and Cyrillic atlases
   (`bake_fonts.py`, `bake_cyrillic.py`) cover fixed character sets and only need a rebake if
   that set changes; they need the **variable** `Ubuntu[wdth,wght].ttf`, not the static
   Ubuntu-R/B files, or the glyph widths and weights change.
4. `node kit/tools/test_locales.js`: builds the app in every language and checks that every
   character of every translation has a glyph.

## Licences

- This repository: MIT, Copyright (c) 2026 Alex Perea (`LICENSE`).
- The MGU App Kit it is built on: MIT, Copyright (c) 2026 cauliflowermossgrape, with the
  Chinese translation Copyright (c) 2026 小白151 (JackieZ123430), the Russian by Иван
  (Fieldistor) and the Korean by jaimeen shim. Fonts under the Ubuntu Font Licence and the SIL
  OFL; the emulator's draw engine (mgu-render) GPL-3.0-or-later, source included. All of it in
  `THIRD_PARTY_NOTICES.md`.
- Cluster Themes (`apps/perea_cluster_themes`, `shared/`, `bench/`, `tools/`, `scripts/`): bimmer-lab's
  work, MIT, Copyright (c) 2026 bimmer-lab; `shared/cluster_render_client.js` MPL-2.0, Copyright (C) 2026
  Robert Nisipeanu; its fonts under the SIL OFL. In `THIRD_PARTY_NOTICES.md` and the app's `NOTICE`.
- BMW's SDK and the `.mgu` / `.tgz` packages that contain it are never published.
