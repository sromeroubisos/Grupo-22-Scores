# Titan Design System 🛰️

The Titan Design System is the official visual language for the G22 Scores Admin Console. It focuses on a premium, dark-mode immersive experience with high contrast and glassmorphic elements.

## 1. Core Palette

| Token | CSS Variable / Value | Usage |
|-------|-------|-------|
| **Primary Accent** | `#00ff88` | Major actions, active states, key highlights |
| **Background Dark** | `#0a0b10` | Main application background (Obsidian) |
| **Surface Dark** | `#141620` | Cards, sidebars, internal panels |
| **Border Dark** | `#242735` | Subtle dividers and component borders |
| **Success** | `#10b981` | Positive indicators |
| **Error** | `#ef4444` | Alerts and destructive actions |

## 2. Typography

- **Headings**: `Inter` (Font-display), Black (900) or ExtraBold weight. Use `italic` for a fast, dynamic sports feel.
- **Body**: `Inter`, Medium (500) or Regular (400) weight.
- **Data/Mono**: `JetBrains Mono` or similar for logs and technical data.

## 3. Visual Effects

- **Titan Glass**:
  - `backdrop-blur-xl`
  - `bg-surface-dark/40`
  - `border border-white/10`
- **Gradients**: Use `primary-accent/20` blurs in background corners for depth.
- **Shadows**: Large, soft obsidian shadows for floating cards.

## 4. Components

- **Cards**: Large border radius (`rounded-3xl` or `2.5rem`), padding `p-8` or `p-10`.
- **Buttons**:
  - **Primary**: `bg-primary-accent`, `text-background-dark`, `font-black`.
  - **Secondary**: `titan-glass`, `text-white`, `border-border-dark`.
- **Icons**: `Material Symbols Outlined` with a consistent weight and size.

## 5. Implementation (Tailwind)

```typescript
// tailwind.config.ts extension
theme: {
  extend: {
    colors: {
      'primary-accent': '#00ff88',
      'background-dark': '#0a0b10',
      'surface-dark': '#141620',
      'border-dark': '#242735',
    },
    fontFamily: {
      display: ['Inter', 'sans-serif'],
    },
  },
}
```

## 6. Design System Notes for Stitch Generation (REQUIRED)

When generating new pages or screens using Stitch, use the following prompt block:

> **AESTHETICS (TITAN DESIGN SYSTEM):**
> Use a ultra-premium dark-mode sports aesthetic.
> Background: Deep Obsidian (#0a0b10).
> Cards/Panels: Glassmorphic with #141620 background, 40% opacity, and 20px blur. Borders should be subtle #242735.
> Primary Accents: Vibrant Emerald (#00ff88) for buttons and active states.
> Typography: Use "Inter" font. Headings should be italicized, all-caps, and extra-bold for a high-performance feel.
> Icons: Minimalist outlined style.
> Details: Add soft green/blue glows in the background corners for depth.
