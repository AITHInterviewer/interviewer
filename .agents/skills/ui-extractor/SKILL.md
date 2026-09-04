---
name: ui-extractor
description: Automated onboarding skill for SaaS tenants. Analyzes visual branding (screenshots/websites) and business niche to generate theme configurations using industry-standard design systems from ui-ux-pro-max and outputs them as a system API curl command.
---

# UI Extractor & Brand Engineer

## Overview

This skill automates the branding process for new companies joining the Earnify SaaS platform. It leverages the `@ui-ux-pro-max` skill to determine optimal color palettes and design systems based on the business industry, then generates a `curl` command to update the system theme.

## Workflow

### 1. Niche & Context Analysis

- **Identify Industry**: Analyze the screenshot or website to determine the business category (e.g., Beauty/Wellness, Men's Suits, Specialty Coffee, Retail).
- **Leverage Design Intel**: **ALWAYS** use the `@ui-ux-pro-max` skill first to fetch industry-standard design systems:
  ```bash
  python3 skills/ui-ux-pro-max/scripts/search.py "<industry> <keywords>" --design-system
  ```
- **Refine Palette**: Use the results from `ui-ux-pro-max` to ensure colors are professional and cohesive.

### 2. Palette Extraction (WCAG Compliant)

- **Primary Color**: From `ui-ux-pro-max` or the brand assets, identify the core identity color.
- **Light/Dark Mode**: Generate full palettes for both modes. Ensure a minimum contrast ratio of 4.5:1.
    - **Keys**: `accent`, `accent-foreground`, `background`, `border`, `card`, `card-foreground`, `error`, `font`, `foreground`, `input`, `logo_url`, `muted`, `muted-foreground`, `primary`, `primary-foreground`, `radius`, `secondary`, `secondary-foreground`, `success`.

### 3. Curl Command Generation

Generate a `curl` command to POST the configuration to the system API.

**URL**: `https://api.kelback.com/api/system/theme`
**Headers**:
- `Accept: application/json, application/problem+json`
- `Authorization: Bearer <TOKEN>` (Ask user for token if not provided, default to placeholder)
- `Content-Type: application/json`
- `X-Company-Slug: <company-slug>`

**Format**:
```bash
curl --request POST \
  --url https://api.kelback.com/api/system/theme \
  --header 'Accept: application/json, application/problem+json' \
  --header 'Authorization: Bearer <auth_token>' \
  --header 'Content-Type: application/json' \
  --header 'X-Company-Slug: <slug>' \
  --data '{
  "theme": {
    "brand_name": "<Brand Name>",
    "industry": "<Industry>",
    "theme": {
      "dark": {
        "accent": "#HEX",
        "accent-foreground": "#HEX",
        "background": "#HEX",
        "border": "#HEX",
        "card": "#HEX",
        "card-foreground": "#HEX",
        "error": "#HEX",
        "font": "Inter",
        "foreground": "#HEX",
        "input": "#HEX",
        "logo_url": "URL",
        "muted": "#HEX",
        "muted-foreground": "#HEX",
        "primary": "#HEX",
        "primary-foreground": "#HEX",
        "radius": "0.5rem",
        "secondary": "#HEX",
        "secondary-foreground": "#HEX",
        "success": "#HEX"
      },
      "light": {
        "accent": "#HEX",
        "accent-foreground": "#HEX",
        "background": "#HEX",
        "border": "#HEX",
        "card": "#HEX",
        "card-foreground": "#HEX",
        "error": "#HEX",
        "font": "Inter",
        "foreground": "#HEX",
        "input": "#HEX",
        "logo_url": "URL",
        "muted": "#HEX",
        "muted-foreground": "#HEX",
        "primary": "#HEX",
        "primary-foreground": "#HEX",
        "radius": "0.5rem",
        "secondary": "#HEX",
        "secondary-foreground": "#HEX",
        "success": "#HEX"
      }
    }
  }
}'
```

---

## Resources

### references/

- **theme_schema.md**: Reference for the full JSON structure and supported keys for the system API.

---

## Examples

### Recommended Premium Configuration (Aromeo Example)

```json
{
  "theme": {
    "brand_name": "Aromeo",
    "industry": "Beauty & Wellness",
    "theme": {
      "light": {
        "background": "#ffffff",
        "foreground": "#000000",
        "primary": "#C5A05A",
        "primary-foreground": "#ffffff",
        "secondary": "#f9f9f9",
        "secondary-foreground": "#000000",
        "accent": "#C5A05A",
        "accent-foreground": "#ffffff",
        "muted": "#f3f4f6",
        "muted-foreground": "#6b7280",
        "card": "#ffffff",
        "card-foreground": "#000000",
        "border": "#e5e7eb",
        "input": "#f9fafb",
        "radius": "0.5rem",
        "font": "Inter",
        "logo_url": "https://res.cloudinary.com/dekhi8iac/image/upload/v1770202092/aromeo_logo_white_reznen.png"
      },
      "dark": {
        "background": "#0c0c0c",
        "foreground": "#ffffff",
        "primary": "#C5A05A",
        "primary-foreground": "#000000",
        "secondary": "#1a1a1a",
        "secondary-foreground": "#ffffff",
        "accent": "#C5A05A",
        "accent-foreground": "#000000",
        "muted": "#1f2937",
        "muted-foreground": "#9ca3af",
        "card": "#141414",
        "card-foreground": "#ffffff",
        "border": "#262626",
        "input": "#1a1a1a",
        "radius": "0.5rem",
        "font": "Inter",
        "logo_url": "https://res.cloudinary.com/dekhi8iac/image/upload/v1770202092/aromeo_logo_white_reznen.png"
      }
    }
  }
}
```

## Usage Example

**User**: "Analyze this logo for 'Serenity Spa' and generate the API update."
**Agent**:

1. Runs `@ui-ux-pro-max` search for "beauty spa wellness".
2. Selects a premium palette with gold accents.
3. Generates the `curl` command with the nested `theme` structure.
