# Theme Config Schema — AI Interviewer

The application uses a restrained enterprise-oriented visual identity designed for a technical recruiting and AI interview product.

The source design system is based on semantic CSS tokens rather than component-specific colors. The theme supports both light and dark modes.

## API Endpoint

`POST https://api.kelback.com/api/system/theme`

## Theme Payload

```json
{
  "theme": {
    "brand_name": "AI Interviewer",
    "industry": "HR Tech / Recruitment",
    "theme": {
      "light": {
        "primary": "#140AF0",
        "primary-foreground": "#FDFDFF",

        "secondary": "#E9E9EF",
        "secondary-foreground": "#1C1C20",

        "accent": "#140AF0",
        "accent-foreground": "#FDFDFF",

        "muted": "#E9E9EF",
        "muted-foreground": "#757580",

        "background": "#F2F2F5",
        "foreground": "#1C1C20",

        "card": "#FDFDFF",
        "card-foreground": "#1C1C20",

        "border": "#D5D5DD",
        "input": "#FAFAFD",

        "radius": "0.5rem",
        "font": "Helvetica Neue",

        "error": "#9C3434",
        "success": "#126544"
      },

      "dark": {
        "primary": "#756EFF",
        "primary-foreground": "#111113",

        "secondary": "#27272D",
        "secondary-foreground": "#F4F4F6",

        "accent": "#756EFF",
        "accent-foreground": "#111113",

        "muted": "#27272D",
        "muted-foreground": "#94949E",

        "background": "#111113",
        "foreground": "#F4F4F6",

        "card": "#1D1D21",
        "card-foreground": "#F4F4F6",

        "border": "#33333A",
        "input": "#17171A",

        "radius": "0.5rem",
        "font": "Helvetica Neue",

        "error": "#EF9191",
        "success": "#6FC89F"
      }
    }
  }
}
```

## Source Token Mapping

| Theme API key          | Source token       | Meaning                                        |
| :--------------------- | :----------------- | :--------------------------------------------- |
| `primary`              | `--accent`         | Main brand/action color                        |
| `primary-foreground`   | `--accent-ink`     | Content displayed on primary actions           |
| `secondary`            | `--surface-muted`  | Secondary controls and subdued surfaces        |
| `secondary-foreground` | `--ink`            | Primary readable content on secondary surfaces |
| `accent`               | `--accent`         | Interactive highlight and active state         |
| `accent-foreground`    | `--accent-ink`     | Content on accent background                   |
| `muted`                | `--surface-muted`  | De-emphasized backgrounds                      |
| `muted-foreground`     | `--ink-tertiary`   | Metadata, labels and tertiary text             |
| `background`           | `--canvas`         | Main application background                    |
| `foreground`           | `--ink`            | Main body text                                 |
| `card`                 | `--surface-raised` | Raised panels, cards and containers            |
| `card-foreground`      | `--ink`            | Main text inside cards                         |
| `border`               | `--border`         | Separators and default borders                 |
| `input`                | `--surface`        | Input and textarea backgrounds                 |
| `radius`               | `--radius-control` | Default interactive-control radius             |
| `font`                 | `--font-sans`      | Primary application font                       |
| `error`                | `--danger`         | Destructive and error states                   |
| `success`              | `--positive`       | Successful and positive states                 |

## Extended Design Tokens

The source design system contains additional tokens that are not represented by the current theme API but should remain part of the application's internal design system.

### Light

```json
{
  "surface": "#FAFAFD",
  "surface-raised": "#FDFDFF",
  "surface-muted": "#E9E9EF",
  "surface-selected": "#EDEDFF",

  "foreground-secondary": "#555560",
  "foreground-tertiary": "#757580",

  "border-strong": "#AAAAB5",

  "primary-hover": "#0E06C2",

  "success-soft": "#E2F1E9",

  "warning": "#80530A",
  "warning-soft": "#FFF1CC",

  "error-soft": "#F8E4E4",

  "radius-control": "8px",
  "radius-panel": "12px",
  "radius-pill": "999px"
}
```

### Dark

```json
{
  "surface": "#17171A",
  "surface-raised": "#1D1D21",
  "surface-muted": "#27272D",
  "surface-selected": "#252244",

  "foreground-secondary": "#B8B8C0",
  "foreground-tertiary": "#94949E",

  "border-strong": "#53535D",

  "primary-hover": "#918CFF",

  "success-soft": "#18372B",

  "warning": "#E0B35E",
  "warning-soft": "#3A301C",

  "error-soft": "#3B2325",

  "radius-control": "8px",
  "radius-panel": "12px",
  "radius-pill": "999px"
}
```

## Visual Identity

The interface should feel:

* restrained;
* technical;
* professional;
* enterprise-oriented;
* information-dense without being visually noisy;
* precise rather than decorative.

The existing UI relies heavily on borders, surface hierarchy and typography rather than shadows or decorative effects.

### Primary Visual Characteristics

* Neutral gray canvas.
* Slightly elevated card surfaces.
* High-contrast dark text in light mode.
* Near-black surfaces in dark mode.
* Saturated indigo/violet as the single dominant brand accent.
* Small and medium border radii.
* Thin separators and borders.
* Very limited use of shadows.
* Semantic green, amber and red status colors.
* Compact typography suitable for recruiter dashboards and technical reports.

## Typography

Primary font stack:

```css
"Helvetica Neue", Helvetica, Arial, sans-serif
```

Technical metadata and version labels use:

```css
"SFMono-Regular", Consolas, "Liberation Mono", monospace
```

The API only supports one `font` property, therefore:

```json
{
  "font": "Helvetica Neue"
}
```

should be used as the primary theme value.

## Radius

The application defines three radius levels:

```text
Control     8px
Panel       12px
Pill        999px
```

Since the theme API supports only one `radius`, the default value should correspond to interactive controls:

```json
{
  "radius": "0.5rem"
}
```

Larger panels should continue using `12px` internally.

## Component Behavior

Primary buttons use the brand accent as their background and switch to the darker/lighter accent-hover token on hover.

Secondary buttons use raised surfaces with standard borders.

Status badges use semantic positive, warning and danger colors rather than the brand color.

Inputs use the normal surface background, standard border and control radius.

Cards and major containers use raised surfaces and panel radius.

Selected rows and navigation states use a subtle selected-surface color instead of filling the entire component with the primary brand color.

## Dark Mode

Dark mode is not a simple inversion of the light theme.

It uses dedicated semantic tokens:

* background becomes `#111113`;
* raised surfaces become `#1D1D21`;
* primary text becomes `#F4F4F6`;
* brand accent changes to the lighter `#756EFF`;
* semantic success, warning and error colors become lighter for sufficient contrast.

Components should preserve the same hierarchy and semantic roles between themes.

## Logo

The supplied design files do not define a logo URL.

Therefore `logo_url` should be omitted until a real publicly accessible brand asset is available.

Do not invent or generate a placeholder `logo_url`.

## Implementation Rules

* Use semantic theme keys rather than hard-coded component colors.
* Do not introduce additional arbitrary HEX colors when an existing semantic token is suitable.
* Do not replace the indigo identity color with generic blue.
* Do not introduce gradients as part of the default visual language.
* Avoid large shadows and glassmorphism.
* Preserve the relatively compact `8px` control radius.
* Use `12px` for larger panels where the implementation allows component-level radius values.
* Preserve semantic status colors independently from the primary brand color.
* New UI should extend the existing surface/border hierarchy rather than invent a new card system.
* Both light and dark modes must use the same semantic token roles.

## Agent Guidance

When generating or modifying UI, treat this theme configuration and the existing CSS design system as authoritative.

The agent should:

1. Reuse existing semantic colors.
2. Preserve typography hierarchy.
3. Preserve compact radii.
4. Prefer borders and surface differences over shadows.
5. Use the primary indigo color sparingly for actions, active states and progress.
6. Use semantic success/warning/error colors only for corresponding states.
7. Preserve the existing information-dense enterprise character.
8. Avoid introducing a competing visual identity.
