# Seed Style Guide

Aesthetic philosophies and UX principles for new project repositories. Grounded in the International Typographic Style. Derived from existing work, generalized for reuse.

## Typography Is the Design

The primary design material is type — not color, not containers, not icons. Size, weight, tracking, and case create the entire information hierarchy. A well-set page shouldn't need colored boxes or decorative elements to make the structure legible.

This means maintaining a disciplined type scale with clear purpose at each level. Display sizes are tight-tracked and confident. Labels and metadata occupy a distinct register — small, bold, uppercase, wide-tracked — that reads as "system" rather than "content." Body text is set for sustained reading with generous line-height. The scale should have no more than four or five distinct sizes in active use on any single view; if it needs more, the hierarchy has a problem.

When a project includes substantial prose alongside structural UI, a two-typeface system works well: sans-serif for command and organization, serif for reading and analysis. For tools and dashboards where prose is minimal, a single sans-serif family is cleaner.

## Color Is Semantic

The working palette is achromatic. Background, text, borders, labels, and structural elements live on a grayscale spectrum with enough steps to create depth without resorting to color.

Color enters the system only when it carries specific meaning: urgency, status, error, opportunity, active state. One accent color is usually sufficient. If a second semantic color is needed, it should be muted enough to avoid competing with the first.

Color should never be the sole differentiator for any state. Pair it with weight, text, or position so the interface remains legible in grayscale.

## Restraint Over Decoration

Every visual element earns its place by serving comprehension or reducing friction. Nothing exists for ornamentation.

Borders are dividers and state indicators, not containers. Prefer whitespace for separation; add a line only when spacing alone creates ambiguity. Maintain at most two border weights — hairline for subtle structure, heavy for emphasis — and keep radius minimal or zero. A left-edge accent border is a useful pattern for signaling priority or category on cards and callouts.

Shadows, gradients, and background fills appear only when they communicate something specific (elevation for a modal, a subtle wash to group related content). They are never applied for visual interest.

## Respect the Grid

All spacing derives from a fixed base unit. Padding, margin, gap, and structural dimensions are multiples of that unit — no magic numbers. This creates consistent visual rhythm without per-element negotiation.

Layout tokens (grid gap, page padding, header height, status bar height) should be named and centralized so that structural proportions can change in one place.

## Motion Is Confirmation, Not Performance

Transitions exist to confirm state changes. Hover shifts color. A panel slides open. A toast fades in. That's it.

Keep durations short (120–200ms for micro-interactions, up to 300ms for larger layout shifts). Use simple easing. Hover effects should be barely perceptible — a color change, a subtle border shift. No entrance animations on page load. Content appears; it doesn't arrive.

## Controls Are Text

Buttons, links, and form elements are extensions of the typographic system, not separate decorative objects. A primary action is filled and terse. A secondary action is outlined or borderless. A tertiary action is styled text with a hover state.

Inputs for inline editing can use a bottom-border-only treatment that disappears into the content until activated. Dedicated forms use full borders. Focus states are always visible and high-contrast — a solid outline, never a glow or shadow.

Dropdowns and selects are custom-styled to match the surrounding type. Native chrome breaks the system.

## Write for Scanners

UI copy follows the same discipline as the visual design. Labels are terse, specific, and consistent in grammatical structure. Timestamps are relative when recency matters, absolute when precision does. Status messages use plain active language. Error messages explain what happened and what the user can do about it — no apologies, no jargon.

Lead with the implication for the person reading, not the system's internal state.

## Information Hierarchy Is Fixed

Every view answers the same three questions in the same order:

1. What needs attention right now?
2. What's the broader context?
3. Where did this come from?

Signal and urgency surface first. Institutional or operational meaning comes second. Source, metadata, and provenance sit at the bottom of the stack. This ordering holds whether the unit is a card, a detail view, or a notification.

## Ambient Over Interruptive

Persistent, glanceable status indicators (connection health, sync state, counts, timestamps) belong in the architecture — a footer bar, a header strip — not in modals or alerts. Toasts handle transient confirmations and disappear on their own. Modals are reserved for actions that require deliberate confirmation.

Empty states are quiet: a single line of subdued text, centered, that says what could be here and how to put it there.

## Applying This

These are principles, not a component library. Each project should interpret them for its own context — a dense operational dashboard will set tighter spacing and smaller base type than a reading-oriented product, but both should be recognizably built from the same posture.

The minimum artifacts for a new project's design system: a token file defining the project's specific values for color, type, spacing, and motion; and a short design doc noting any intentional deviations from these principles and why.
