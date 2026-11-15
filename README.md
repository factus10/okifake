# Okifake

Okifake makes any image look like a printout from an **Okidata Okimate 10 or Okimate 20**, the mid-1980s wax thermal-transfer color printers.

**Try it online: [factus10.github.io/okifake](https://factus10.github.io/okifake/)**

You can also open `index.html` from a local copy. There is no build step and nothing to install. Drop, paste or choose an image, adjust the settings, and save the result as a PNG. Turn on **Watch it print** to see the page print band by band, with a yellow, magenta and cyan pass for each band, much as the real printer did.

## What it simulates

The model comes from the Okidata manuals and real printouts. Background and sources are in [OKIMATE-RESEARCH.md](OKIMATE-RESEARCH.md).

| Real printer | In Okifake |
|---|---|
| Printhead is a column of heat elements: Okimate 10 prints graphics in 7-dot bands at 60×72 dpi; Okimate 20 prints 8-dot bands at 60×72 dpi or 24-dot bands at 120×144 dpi. | **Model** setting. The image is rasterized onto that dot grid and printed one band at a time. |
| The color ribbon has yellow, magenta and cyan panels, and each band gets three passes. There is no black panel, so black is Y+M+C. | Each pass is drawn as its own wax layer, and layers multiply where they overprint. Black is a three-color composite and comes out brownish, as it did on the real printer. |
| Tints are made with ordered dot patterns. A "checkered red gives you a pink" (manual). | Every source pixel is matched to the nearest printable mix (2–17 levels per ribbon color) and printed with a 4×4 Bayer pattern. Yellow and cyan share dot positions; magenta fills the gaps. |
| Text on screen was made of pixels in solid screen colors, so it printed as solid ink, not tint patterns. | **Solid text & lines** finds thin strokes that stand out from a flat or smoothly shaded background, such as lettering, captions and outlines. Those pixels print in solid ribbon colors (black, red, green, blue, yellow, magenta, cyan or no ink) and stay out of the dithering. Detail inside textured picture areas is left alone. Set the slider to 0 to turn this off. |
| Color software worked from low-resolution screens. | **Source pixels**: 80, 160 (Atari or C64 screen-dump look), 320, 640, or dot-level for photos. Optional error diffusion. |
| Wax sticks only where paper touches the head. Smooth Hammermill paper prints solid; copier paper speckles; 25% cotton bond falls apart (manual, p. 41). | **Paper** presets build a fibrous height field at the output resolution. Valleys drop out dots, and dot edges go ragged. |
| Paper-feed error between bands leaves thin white gaps or dark overlaps. Color passes don't register exactly. Head elements leave fine lines. One dead element leaves a line in every band. | **Mechanics & wear** sliders. A random seed fixes the quirks, and **New quirks** rerolls them. |
| No ribbon plus thermal paper gives a black-only image. | The **Thermal paper** preset prints a blue-black image on gray-white paper. |
| Aging | **Age** yellows the paper, adds foxing stains and fades the inks (yellow fades fastest). **Tractor-feed edges** adds pin-feed strips with transparent holes. |

## Text mode

Switch to the **Text** tab to type text. It prints in the Okimate 10's own 10-cpi font: 7-dot capitals, true descenders, strokes two half-dots wide, and a slashed zero. Each line takes one head pass, so feed errors, pin gaps, paper roughness and aging apply to text as well.

- **Where the font came from:** I traced it from the 600-dpi scan in `reference/`. `tools/extract_font.py` cuts every character out of its cell, aligns and averages all instances of each character, and snaps the result to the 1/120″ × 1/72″ dot grid. The 63 characters that appear on the page come from that scan. The rest (B J Q V Z and most punctuation) are drawn by hand in the same style. The font is in [okifake-font.js](okifake-font.js).
- **Color text:** with the color ribbon, tags such as `{red}`, `{orange}`, `{yellow}`, `{green}`, `{blue}`, `{purple}` and `{black}` switch color. Those are the seven text colors the manual lists. `{magenta}`, `{cyan}`, `{pink}`, `{brown}` and `{gray}` also work. Tints use checkerboard dots, and black is the three-color composite.
- **From code:** `Okifake.render(null, { text: 'HELLO', ribbon: 'black' }, canvas)`. Load `okifake-font.js` before `okifake.js`.

Ink colors follow Antic's 1986 description: "ruby red, jet black, lemon yellow, sky blue." They are tuned against the Okimate 10 factory test page in `samples/`.

## Command line

The same engine runs in Node 18 or later. It has no dependencies.

```bash
node cli/okifake.mjs screen.png -o print.png
node cli/okifake.mjs photo.jpg -o print.png --model oki20 --pixels 0 --levels 5 --paper copier
node cli/okifake.mjs --text "HELLO {red}WORLD" -o hello.png --ribbon black
node cli/okifake.mjs --text-file listing.txt -o listing.png
node cli/okifake.mjs --help
```

Options are the web page's settings in kebab-case (`--print-width 4`, `--solid-text 0.8`, `--dead-pin`), and `key=value` works too. The web page writes them out for you: set it up, then use **Use these settings elsewhere**. To get an `okifake` command, run `npm link` in this folder.

- **Inputs:** PNG is read directly. Other formats are converted with macOS `sips`, or with ImageMagick where that is installed.
- **Output size:** output PNGs record their print resolution, so LaTeX, Word and browsers show them at the real printed size.
- **Paper color:** `--paper-color '#fcf9f0' --paper-shade 0` gives the printout the page's color and flat paper texture, so it looks printed on the document page itself.

## In documentation builds

### Pandoc (and the dot-matrix manual process)

[integrations/pandoc/okimate.lua](integrations/pandoc/okimate.lua) is a pandoc filter.

- **Images:** an image marked `{.okimate}` prints as an Okimate printout. Attributes are Okifake settings.
- **Text:** a code block marked `{.okimate}` prints in the Okimate 10 font.

````markdown
![Title screen](title.png){.okimate}
![Box art](box.jpg){.okimate model=oki20 pixels=0 paper=copier print-width=3}

```{.okimate}
{blue}10 REM {red}HOME{black} SWEET HOME
20 GOTO 10
```
````

```bash
pandoc doc.md --lua-filter integrations/pandoc/okimate.lua -o doc.pdf
```

- **Document-wide settings:** go in the front matter, for example `okimate: {all: true, paper: copier}`. `all: true` prints every image, and `{.no-okimate}` excludes one image.
- **Page color:** `-M okimate-page-color=#FCF9F0` gives printouts the page color.
- **Cache:** rendered images are cached in `.okimate-cache/` next to the Markdown file.
- **Dot-matrix manuals:** [dotmatrix-pdf](https://github.com/factus10/dotmatrix-pdf) turns Markdown into a 1980s dot-matrix style PDF. Its `dotmatrix-pdf.sh` loads the filter automatically when this folder is at `~/Documents/github/okifake`; set `OKIFAKE_HOME` if it is somewhere else.

### ts-program-manual skill

Use `{{okimate:name}}` in a manual or zine source. The build prints `images/name.png` (or `name.txt` for text) through Okifake and embeds it at its real printed size. Put it in a `<figure class="printout">`. Settings follow a bar: `{{okimate:title|paper=copier,print-width=3}}`. Set `OKIFAKE_CLI` if this folder is not at `~/Documents/github/okifake`.

## Using the engine directly

```html
<script src="okifake-font.js"></script>
<script src="okifake.js"></script>
<script>
  const out = document.createElement('canvas');
  await Okifake.render(imageOrCanvas, { model: 'oki20', paper: 'copier', pixels: 0, levels: 5 }, out);
</script>
```

Without a canvas, `render` returns `{ W, H, data, ppi }` with RGBA pixels. The source can be any `{ width, height, data }` RGBA buffer. This is how the command line uses it (`require('./okifake.js')`). All options are listed in `Okifake.DEFAULTS` in [okifake.js](okifake.js).

## GitHub Pages

The site at [factus10.github.io/okifake](https://factus10.github.io/okifake/) is served from the repository root on `main` (`index.html`, `okifake.js` and `okifake-font.js`; `.nojekyll` turns off Jekyll). Every push to `main` republishes it within a minute or so.

`.gitignore` leaves out `manuals/` (36 MB of scanned manuals) and ptouchman's emulator in `reference/`, because they are third-party material. Remove those lines if you want them in the repository.

## Folders

- `samples/` — real Okimate printouts, magazine photos, and the test page from the virtuallyfun blog post, used as references
- `manuals/` — Okimate 10 and Okimate 20 (Commodore MCS-820) manuals
- `reference/` — ptouchman's 2014 Okimate 20 JavaScript emulator, which interprets real Amiga print streams, and a scan of an Okimate 10 text printout
- `tools/` — the font-extraction script and the transcript of the scanned page it aligns against
- `cli/` — the command-line renderer
- `integrations/` — the pandoc filter
