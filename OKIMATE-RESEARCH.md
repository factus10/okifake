# Okimate 10 / Okimate 20 — research notes

Compiled 2026-11-15 from period manuals, magazine reviews and forum posts. Local copies of the two manuals are in [manuals/](manuals/), and sample output images are in [samples/](samples/).

## Corrections to the starting assumptions

| Assumption | What the sources say |
|---|---|
| Color ribbon is CMYK | **No — it is YMC.** The Okimate 20 handbook says the color ribbon has three strips, *yellow, magenta (light red) and cyan (light blue)*, "plus a short black marker and a clear strip". The black marker is only there to align the ribbon and is never printed. Black on a color print is a three-color composite. Real black comes from the separate black ribbon. |
| Hammermill made a special paper | **Confirmed.** The Okimate 10 manual (p. 6) recommends "Plain Paper for Thermal Transfer Printers from Hammermill Paper Company". It also names *Compucolor Ribbon Transfer Paper* (Schoeller) and Rediform boxes marked "Recommended for Thermal Transfer Printers". Okidata's online Okimate 20 (IBM) guide names Hammermill too. Sealed packs still turn up on eBay. |
| Prints on thermal paper with no ribbon | **Confirmed, black only.** Both manuals and both reviews say this. ST-Log (1988) notes that it doesn't work for color. Thermal paper usually came on rolls, and Okidata sold an optional roll stand. Forum users report that the fax paper fades or discolors over time. |

## The two models

| | Okimate 10 | Okimate 20 |
|---|---|---|
| Introduced | mid-1984 (COMPUTE! Oct 1984 news item; Plus/4 World lists 1984-06-01) | 1985 (on *Computer Chronicles*, Sept 1985; PC Magazine review April 1985) |
| Price | $238–$240 | $268 with Plug 'N Print module (Antic 1986, ST-Log 1988); a European source gives $169 list |
| Printhead | **9 elements**, "square dots for full coverage" | **24 elements**; dot size varies with speed and the darkness setting |
| Graphics density | **60 × 72 dpi**; print line 480 × 7 dots | 60×72 (all computers), 120×72, 240×72, and 24-dot mode **120×144 dpi** (some modes PC only) |
| Text | 9×9 dot cell, 60 cps rated (Antic measured 22 cps on the 20) | DP 80 cps (7×14), correspondence quality 40 cps (14×14) |
| Color | "more than 40 shades" | 7 text colors, "40–50 or more" graphics colors |
| Direction | Unidirectional | Unidirectional |
| Interfaces | Plug 'N Print modules: Commodore, Atari 8-bit, Apple, IBM PC | Same idea, adding Amiga and Atari ST. Commodore sold it in Europe as the **MCS-820** (Centronics or RS-232). |

### How color is printed
- For each text line or graphics strip, the head makes **three passes**: yellow, then magenta, then cyan. A carriage return switches to the next color. `ESC CHR$(25)` resets the ribbon to yellow.
- Secondary colors come from overprinting (Y+M = red/orange, Y+C = green, M+C = blue/purple, Y+M+C = composite black). Lighter tints come from **dither/checker patterns**: the manual's example is a "checkered red gives you a pink".
- The ribbon is **single-strike**, so each section of wax is used once. That makes ribbons expensive. Each color pass uses ribbon whether or not it prints.

### Ribbon life and cost
- Okidata spec (Okimate 20): black about 120K characters / ~75 pages; color about 35K characters / **~10 screen prints**.
- Antic 1985 (Okimate 10): one color ribbon lasted ~5 "Microscreen" prints. Antic 1986: 8–10 pictures. ST-Log 1988: ~15 color screens. Forum users report 3 Koala pictures using half a ribbon, and 3 full-page graphics using "about" a whole ribbon.
- Color ribbon $5.49–$6.69, black $4.99–$5.95, paper $6.50 for 250 sheets. Antic estimated **~75¢ per color page**, against under 5¢ on an Epson.

### Speed
- Okimate 10 + Atari BASIC screen dump: **35 minutes** for one Micro Illustrator picture (Antic 1985).
- Okimate 20 on the ST: 6–10 minutes per color screen (Antic 1986). ST-Log measured 11.5 minutes color, 2.75 minutes black and white, and 2.5 minutes for a text page.

## Paper and the look of the output

- **Smooth paper is essential for graphics.** The Okimate 10 manual says it prints on "thermal or smooth paper". The Okimate 20 handbook says almost any paper is fine for text *except paper with rag/cotton content* (typewriter bond, erasable bond), and that "the smoother the paper you use, the better the color production."
- **Rough paper drops out dots.** The Okimate 10 manual's troubleshooting page shows a photo printed on **25% cotton bond**. The image breaks up into speckle and loses most of its midtones ([samples/okimate10-manual-p41-rough-paper.png](samples/okimate10-manual-p41-rough-paper.png)). One forum user described how "any minor pulp lump" leaves small gaps in characters. Wax only sticks where paper fibers touch the head, so texture shows up as random white dropouts.
- **On good paper the wax gives a solid, opaque, slightly glossy finish.** Users describe it as more opaque than ink-ribbon dot matrix, with no ink bleed. Antic praised its "amazing fidelity".
- **Banding between passes.** ST-Log reported lines of data often printed unevenly, leaving thin white gaps or dark overlaps between bands. That is classic paper-feed misregistration on a strip printer. Color slipping at the right edge of each line (wrong color on the right side) is a documented fault, caused by ink building up on the ribbon gripper.
- **Color quirks.** The Okimate 10 manual says Commodore gray 1 and gray 2 print with a slight blue tint. Antic 1985 said colors were "not as bright or sharp" as the screen and needed much tweaking of the color registers. A wrongly threaded color ribbon gives prints that are "mostly yellow and red".
- It also prints on **acetate** for overhead transparencies (3M Transparency Note Pad recommended).

## Output examples (saved in `samples/`)

| File | What it shows |
|---|---|
| [okimate10-antic1985-clown-print.jpg](samples/okimate10-antic1985-clown-print.jpg) | Okimate 10 print of an Atari Micro Illustrator picture (Antic, Mar 1985). It shows the 9-pin band structure, heavy horizontal striping, a limited magenta/cyan palette, and Okimate text below. |
| [okimate10-antic1985-clown-screen.jpg](samples/okimate10-antic1985-clown-screen.jpg) | The same picture on screen, for comparison. |
| [okimate20-antic1986-bee-degas.jpg](samples/okimate20-antic1986-bee-degas.jpg) | Okimate 20 print of Tom Hudson's DEGAS "Bee" (Antic, Oct 1986). Saturated red, yellow and green on what looks like coated paper. |
| [okimate20-antic1986-cactus-degas.jpg](samples/okimate20-antic1986-cactus-degas.jpg) | DEGAS art-contest "Cactus" print. The visible horizontal banding and dithered greens are a good reference for the texture. |
| [okimate20-antic1986-color-text.jpg](samples/okimate20-antic1986-color-text.jpg) | Color text: yellow, magenta, blue, and composite black characters. |
| [okimate20-antic1986-gem-desktop.jpg](samples/okimate20-antic1986-gem-desktop.jpg) | GEM desktop dump in color. |
| [okimate10-manual-p41-rough-paper.png](samples/okimate10-manual-p41-rough-paper.png) | Okidata's own "bad paper" examples: text and a photo printed on 25% cotton bond. |
| [okimate20-stlog1988-press-photo.jpg](samples/okimate20-stlog1988-press-photo.jpg), [okimate10-compute1984-product-photo.jpg](samples/okimate10-compute1984-product-photo.jpg), [okimate10-hardware-photo.jpg](samples/okimate10-hardware-photo.jpg), [okimate20-antic1986-printer-with-st.jpg](samples/okimate20-antic1986-printer-with-st.jpg) | Hardware and press photos. |

All of these are magazine photos or scans of prints, so the color and texture are only approximate.

### More examples I found but couldn't fetch (the sites block automated access; open them in a browser)
- Lemon64 — "Okimate 10 in living color" (C64 Koala printouts made with Final Cartridge III): https://www.lemon64.com/forum/viewtopic.php?t=32020
- Lemon64 — Okimate 20 refurbishment video thread: https://www.lemon64.com/forum/viewtopic.php?t=75909
- Lemon64 — Okimate 10 vs 20: https://www.lemon64.com/forum/viewtopic.php?t=36504&start=15
- Lemon64 / AtariAge — printing without a ribbon (thermal paper): https://www.lemon64.com/forum/viewtopic.php?t=52365 , https://forums.atariage.com/topic/226307-okimate-1020-printing-without-a-ribbon-thermal-paper
- AtariAge — Okimate screen print: https://forums.atariage.com/topic/307998-okimate-screen-print/
- YouTube — C64 Print Shop banner on an Okimate 20, timelapse: https://www.youtube.com/watch?v=h8YYwJu-E5I
- Computer Chronicles (Sept 1985) Okimate 20 segment, recapped here: https://www.smoliva.blog/post/computer-chronicles-revisited-045-okimate-20-ibm-quietwriter-hp-laserjet-plus-adobe-postscript/
- Ahoy! March 1985 review (Okimate 10, C64): https://archive.org/stream/Ahoy_Issue_15_1985-03_Ion_International_US#page/n99
- RUN Magazine, Dec 1986: https://archive.org/stream/run-magazine-36/Run_Issue_36_1986_Dec
- Full magazine scans: archive.org/details/1985-03-anticmagazine (p.30), 1986-10-anticmagazine (p.62), ST_Log_Magazine_Issue_23 (p.90), 1984-10-compute-magazine (p.188)

## Programming notes (from the manuals and the P-Touch blog's Amiga driver analysis)
- `ESC CHR$(25)` resets to yellow. Each CR (without LF) advances to magenta, then cyan. After the third pass send CR+LF.
- Okimate 20 graphics: `ESC K` single (60 dpi), `ESC L`/`ESC Y` double (120 dpi), quad 240 dpi (no two adjacent dots on a row), plus 24-dot mode (120×144). The Amiga driver uses `ESC % O` + 2-byte width + 3 bytes per 24-dot column, and `ESC J n` for n/216" feed. It prints 960 pixels across at 120 dpi.
- Line spacing in n/144" (Okimate 10) or n/216" (Okimate 20).
- A Timex/Sinclair "Okimate 20 Downline Loadable Character Generator" exists on timexsinclair.com.

## Sources
- Okimate 10 manual (Commodore, rev. July 1985): https://files.commodore.software/reference-material/manuals/commodore-64-manuals/hardware-manuals/okimate-10-printer-manual-revised-1985-Jul.pdf
- MCS-820 / Okimate 20 handbook: https://bio.nic.funet.fi/pub/cbm/manuals/printers/MCS-820_Printer_Handbook_(aka_Okimate_20).pdf
- Okidata Okimate 20 (IBM) user guide, "Choosing the proper paper": https://my.okidata.com/om20ibm.nsf/MOCContents/5D08E4AD167D87C18525634700667E27?OpenDocument (now offline)
- Sams Computerfacts service data, Okimate 20: https://archive.org/details/Sams_Computerfacts_Okidata_Okimate_20_Printer_1987_Howard_Sams
- Wikipedia, Okimate 10: https://en.wikipedia.org/wiki/Okimate_10
- Antic, Mar 1985, color printers: https://atarimagazines.com/v3n11/color_printers.php
- Antic, Oct 1986, Okimate 20 review: https://www.atarimagazines.com/v5n6/Okimate20.html
- ST-Log, Sep 1988, Okimate 20 review: https://www.atarimagazines.com/st-log/issue23/90_1_REVIEW_OKIMATE_20_COLOR_PRINTER.php
- COMPUTE!, Oct 1984, news item: https://www.atarimagazines.com/compute/issue53/081_1_NEWS_PRODUCTS_Color_Printer_For_Commodore_And_Atari.php
- COMPUTE! #76, Amiga/ST interfaces: https://www.atarimagazines.com/compute/issue76/news_products_color_printer_interfaces.html
- Plus/4 World: https://plus4world.powweb.com/hardware/Okimate_10
- P-Touch fun blog, Okimate 20 driver: http://ptouchman.blogspot.com/2014/07/okimate-20.html
- eBay listing, Hammermill thermal transfer paper: https://www.ebay.com/itm/144465620664
