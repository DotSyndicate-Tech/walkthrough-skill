# storyboard.json

Paths are relative to the storyboard file. `\n` breaks a heading onto a new line.

```json
{
  "maxSeconds": 120,
  "sound": true,
  "brand": {
    "primary": "#a37933",
    "dark": "#7d5b22",
    "ground": "#f7f2ea",
    "logo": "logo.svg",
    "fontFile": "brand.woff2"
  },
  "scenes": [
    { "type": "title", "heading": "Bulk import\nof products", "sub": "Add hundreds at once" },
    { "type": "example", "heading": "How it works", "boxes": [
      { "label": "Your file", "value": "250 rows", "note": "Excel" },
      { "label": "Checked", "value": "248 valid" },
      { "label": "Added", "value": "248 products", "note": "in one step" }
    ] },
    { "type": "chapter", "title": "Upload the file" },
    { "type": "shot", "frame": "u1", "caption": "Open Products and click Import", "click": true },
    { "type": "shot", "frame": "u2", "caption": "Choose your file", "click": true, "focus": [800, 450, 1.3] },
    { "type": "shot", "frame": "u3", "caption": "Done. The new products appear in the list", "sound": "bell", "dur": 4 },
    { "type": "list", "heading": "Remember", "items": ["Rows with errors are skipped", "Imports cannot be undone"] },
    { "type": "end", "heading": "Import in one step.", "sub": "Products > Import" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `brand.primary` | `#rrggbb`. `dark` and `ground` are derived when left out. White text sits on `dark`, so it must contrast |
| `brand.fontFile` | a font file in the project. Without it the video uses Inter |
| `sound` | `false` renders silent |
| `dur` | seconds. Left out, it is computed from the amount of text |
| `frame` | name of a captured frame (`<frame>.png` and `<frame>.json`) |
| `caption` | required on shots, at most 70 characters |
| `click` | moves the cursor to the captured target and clicks at the end of the shot |
| `typing` | key sounds at the start; use on the shot that first shows typed text |
| `focus` | `[x, y, zoom]` in page pixels. Left out: zoom 1.3 on the target, else the whole screen |
| `sound` on a shot | `"bell"` or `"drop"` |

Chapters are numbered automatically. Chapter and card scenes between two shots restart the camera, so each chapter can start anywhere on screen.
