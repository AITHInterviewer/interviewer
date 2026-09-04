# Design System

## Source of truth

The visual identity of the application is defined by:

- `frontend/styles/tokens.css`
- `frontend/styles/app.css`

All new UI must reuse these tokens and visual patterns.

Do not introduce arbitrary colors, spacing, radii, shadows, or typography
unless no suitable existing token or pattern exists.

## Visual character

The interface should feel:
- minimal
- professional
- restrained
- technical
- enterprise-oriented
- information-dense without feeling cluttered

Avoid:
- gradients
- oversized rounded cards
- excessive shadows
- decorative illustrations
- playful colors
- glassmorphism
- arbitrary Tailwind color classes

## Colors

Use semantic CSS variables only:

- `--canvas`
- `--surface`
- `--surface-raised`
- `--surface-muted`
- `--surface-selected`
- `--ink`
- `--ink-secondary`
- `--ink-tertiary`
- `--border`
- `--border-strong`
- `--accent`
- `--positive`
- `--warning`
- `--danger`

Do not hardcode hex colors in components.

## Typography

Primary font:
`var(--font-sans)`

Monospace labels / technical metadata:
`var(--font-mono)`

Headings should follow the typography already established in `app.css`.

## Radius

Controls:
`var(--radius-control)`

Panels:
`var(--radius-panel)`

Pills/status:
`var(--radius-pill)`

## Components

Before creating a new component, reuse patterns from `app.css`:

- `.button`
- `.status`
- `.candidate-card`
- `.section-heading`
- `.setup-stage`
- `.answer-workspace`
- `.decision-bar`
- `.requirement-row`

New components should visually extend these patterns rather than invent a new style.

## Responsive behavior

Follow the breakpoints and responsive patterns already present in `app.css`.

## Dark mode

All new UI must work with `[data-theme="dark"]`
without introducing separate hardcoded dark-mode colors.