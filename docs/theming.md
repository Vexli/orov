# Theming OfficeOrg

This guide is for designers who keep the brand's design tokens, and for the admin who imports
them. OfficeOrg can take your colors, fonts, corner radius, spacing and density from a design
token file, without any code change, so the directory, floor map and org chart match the brand.

OfficeOrg never uses your token names directly. Every part of the app is styled through a fixed
list of **slots** (`bg`, `primary`, `room.busy`, …). Importing a theme means mapping your tokens
onto those slots. Any slot you don't map keeps its default, so a partial theme still works.

> **Status:** the token format, mapping rules and checks below are in place. The Branding admin
> page that imports a file, previews it and applies it is still being built (plan.md, Phase 5.5).

The default theme, written as a token file, is
[`theme/default.tokens.json`](../theme/default.tokens.json). It's generated from the slot list,
so it's always a complete, valid example of the format.

## Exporting tokens

OfficeOrg reads the [W3C design tokens format (DTCG)](https://www.designtokens.org) and the older
Tokens Studio JSON format. You can give it one file or several.

| Tool                                 | How to export                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma** (Variables)                | Use the Variables export where your plan has it, or the Tokens Studio plugin. Figma writes **one file per mode**: upload them together. A file named `Light.tokens.json` or `Dark.tokens.json` sets the mode. |
| **Penpot** (design tokens panel)     | Export all sets as a single file.                                                                                                                                                                             |
| **Tokens Studio**                    | Export as a single file, in either the legacy or the W3C (DTCG) format.                                                                                                                                       |
| **No token file** (a PDF brand book) | Skip the file and type values straight into the mapping editor. Hex colors work, and so does anything else in [Values](#values).                                                                              |

### Sets and modes

A **set** is a group of tokens: a whole DTCG file, or one top-level set in a Tokens Studio or
Penpot file (those files mark this with `$themes` or `$metadata`; `$metadata.tokenSetOrder` is
the order sets apply in). The set's name decides when it applies:

- A set whose name contains the **word** `dark` (`Dark`, `theme/dark`, `Mode-Dark`) applies only
  in dark mode. One with the word `light` applies only in light mode.
- Every other set (`core`, `Global`, `brand`) is a **base** that applies in both modes, before
  the mode's own sets. A later set overrides a token of the same name from an earlier one.

A single token can also carry both values itself, which is how OfficeOrg's own export writes
them:

```json
"bg": {
  "$type": "color",
  "$value": "#ffffff",
  "$extensions": { "mode": { "light": "#ffffff", "dark": "#0a0a0a" } }
}
```

Tokens Studio's `$themes` list is not read; only set names are.

### References

A token can point to another with `{group.token}`, such as `"$value": "{color.brand.600}"`.
References can chain, and in Tokens Studio files they can point into another set. A reference
takes the type of the token it points to when it has none of its own.

These are **errors**, which stop the import until they're fixed in the file:

- a reference to a token that doesn't exist
- a loop (`a` → `b` → `a`)
- a file that isn't a JSON object, or has no tokens

These are **skipped**, with a warning, so they never block the rest of the file:

- math and other expressions (`{space.1} * 2`, `1px solid {color.border}`)
- composite tokens (typography, shadow, border), because no slot takes one
- token or group names containing `.`, `{` or `}`, which the format forbids

## Slots

Slots marked _light/dark_ can have a different value in each mode.

### Surface and text (light/dark)

| Slot       | Used for                                     |
| ---------- | -------------------------------------------- |
| `bg`       | Page background                              |
| `fg`       | Default text                                 |
| `muted`    | Subtle surfaces: table headers, chips, hover |
| `muted-fg` | Secondary text                               |
| `card`     | Card and panel background                    |
| `card-fg`  | Text on cards                                |
| `border`   | Borders and dividers                         |
| `ring`     | Focus ring                                   |

### Brand (light/dark)

| Slot             | Used for                                |
| ---------------- | --------------------------------------- |
| `primary`        | Primary buttons and the selected chip   |
| `primary-fg`     | Text on primary                         |
| `accent`         | Highlighted rows and secondary emphasis |
| `accent-fg`      | Text on accent                          |
| `destructive`    | Errors and destructive actions          |
| `destructive-fg` | Text on destructive                     |

### Floor map (light/dark)

| Slot              | Used for                                                      |
| ----------------- | ------------------------------------------------------------- |
| `map.bg`          | Floor plan background                                         |
| `map.selection`   | The focused person's desk, or the selected room               |
| `map.highlight`   | Desks of the highlighted team                                 |
| `map.dim-opacity` | Opacity of everything outside an open area (a number, 0 to 1) |
| `room.free`       | Meeting room free now                                         |
| `room.busy`       | Meeting room busy now                                         |
| `room.soon`       | Free now, but booked within 15 minutes                        |
| `room.stale`      | Room status is more than five minutes old                     |

### Presence (light/dark)

| Slot                      | Used for                                                       |
| ------------------------- | -------------------------------------------------------------- |
| `presence.in-office`      | In the office                                                  |
| `presence.wfh`            | Working from home                                              |
| `presence.away`           | Away: sick or on vacation, as most viewers see it              |
| `presence.vacation`       | On vacation                                                    |
| `presence.sick`           | Out sick                                                       |
| `presence.absent-opacity` | How faded people who are out appear in the simple display mode |

### Team colors (light/dark)

`team.palette.0` to `team.palette.7`: colors for teams that don't have their own.

### Type, shape and space

| Slot                  | Used for                                                           |
| --------------------- | ------------------------------------------------------------------ |
| `font.sans`           | Body and heading font                                              |
| `font.mono`           | Codes such as desk codes and slugs                                 |
| `font.size.base`      | Root font size. Every other text size scales from it               |
| `font.weight.heading` | Heading weight                                                     |
| `radius.base`         | Corner radius of controls and cards                                |
| `spacing.base`        | One spacing step. Every margin and padding is a multiple of it     |
| `density`             | `comfortable`, or `compact` to tighten every spacing step to 87.5% |
| `appName`             | The product name in the header and the browser tab                 |

The logos (`logo.light`, `logo.dark`) and the `favicon` are slots too, but they're uploaded
files rather than tokens.

## Values

Every value is checked against a strict format before it's used, and anything else is refused
with a message naming the slot. This is a security measure as well as a tidy one: a value is
rebuilt from its parts, never copied into the page as written.

| Kind        | Accepted                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color       | `#rgb`, `#rrggbb`, with or without alpha; `rgb()` and `hsl()`, comma or space syntax; a DTCG color object in `srgb` or `hsl`. Other color spaces are read from the object's `hex` if present. |
| Size        | `px` or `rem`: `16px`, `0.375rem`, a DTCG `{ "value": 16, "unit": "px" }`. A bare number means pixels, as Tokens Studio writes sizes. Up to 1000px or 64rem.                                  |
| Opacity     | A number from 0 to 1, or a percentage: `0.45`, `45%`.                                                                                                                                         |
| Font family | A name or a list, as an array or comma-separated. Names may use letters, digits, spaces, `.`, `_` and `-`. Generic families such as `sans-serif` and `system-ui` work as fallbacks.           |
| Font weight | 1 to 1000, or a name: `bold`, `semi-bold` (also `Semi Bold`, `semibold`), and the rest of the DTCG list.                                                                                      |
| Density     | `compact` or `comfortable`.                                                                                                                                                                   |
| Text        | 1 to 60 characters on one line.                                                                                                                                                               |

## Mapping tokens onto slots

OfficeOrg suggests a token for each slot from the token's name and type, and the admin can change
any of them. A token is only offered for a slot of the same kind: a color token for a color
slot, a dimension for a size, and so on.

Suggestions match the **end** of a token's path, so `color.background.default` is suggested for
`bg` and `color.text.subtle` for `muted-fg`. The names recognized include `background`, `text`,
`surface`, `brand`, `danger`/`error`, `success`, `warning`, `focus`, `divider`, `on-primary`,
`font-family-body` and `radius`. A token whose path is exactly a slot name (`map.selection`) is
always suggested for that slot, so naming tokens after the slots is the surest way to map a
whole file.

The mapping is saved with the theme. When you export an updated file from Figma or Penpot and
import it again, each slot keeps its token. If a token has been renamed or removed, its slot
falls back to the default with a warning, and you can map it again.

### Dark mode

A theme either follows the viewer's system dark-mode setting or is light only. When it follows
it:

- a slot mapped to a token with a dark value uses that value in dark mode;
- a slot mapped to a token with only one value uses it in both modes;
- a slot left unmapped keeps OfficeOrg's default dark value.

A light-only theme looks the same whatever the viewer's setting.

## Contrast

Brand palettes often fail accessibility checks, especially for status colors on a map. Every
theme is checked in each of its modes, and a failure blocks saving unless the admin explicitly
overrides it. Each failing color comes with the nearest shade of the same hue that passes.

| Check                           | Pairs                                                                                                                                                                              | Minimum                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Text (WCAG AA, 1.4.3)           | `fg` on `bg`, `muted-fg` on `bg` and on `muted`, `card-fg` on `card`, `primary-fg` on `primary`, `accent-fg` on `accent`, `destructive-fg` on `destructive`, `destructive` on `bg` | 4.5:1                                    |
| Status colors (WCAG AA, 1.4.11) | Every `room.*` and `presence.*` color on `map.bg` and on `card`                                                                                                                    | 3:1                                      |
| Color-vision deficiencies       | `room.free`, `room.busy` and `room.soon`, each pair, as seen with protanopia, deuteranopia and tritanopia                                                                          | A color difference (ΔE in OKLab) of 0.06 |

The last check catches the most common problem: a red and a green of the same lightness look
the same to many people. Making one of them clearly lighter or darker fixes it.

## The default theme for a deployment

Until an admin applies a theme, OfficeOrg uses its own defaults, the values in
`theme/default.tokens.json`. To ship a deployment with the brand already in place, point the
`THEME_TOKENS_PATH` environment variable at a token file on the server:

```sh
THEME_TOKENS_PATH=/etc/officeorg/brand.tokens.json
```

That file is mapped by name only: a token whose path is a slot name sets that slot, and nothing
else is suggested. A theme exported from OfficeOrg has exactly that shape, and so does
`theme/default.tokens.json`, which makes a good starting point. The file is read once when the
server starts. If it can't be read or has errors, the server logs why and uses the built-in
defaults; contrast failures are logged as a warning but don't stop it.

A theme applied by an admin always takes precedence. Rolling back to "default" returns to this
file.

## How the theme reaches the page

The active theme is served as a stylesheet at `/theme.css`. Each page links it with a version
in the URL, so browsers cache it until the theme changes. Uploaded fonts and logos are served
from `/api/brand-assets/<id>`. Both are public, because the sign-in page is themed too.
