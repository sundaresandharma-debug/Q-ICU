# Design rules

Constraints for the frontend redesign. `npm run check:design` enforces the ones a script can check and fails CI on a breach.

| Avoid | Status now | Checked by script |
| --- | --- | --- |
| Harsh gradients, radial orbs, dot grids | None. Flat paper background | Yes (gradients) |
| Lucide or other icon packs, sparkle icons | Removed. Text labels and one original SVG mark | Yes |
| Pure white background | Paper `#f1ede4`, panels `#f8f6f0` | No |
| Rainbow, neon, basic pastel colours, purple and black | One accent (deep green `#0f5a4a`), one warning, one danger colour on warm neutrals | No |
| Drop shadows, liquid glass | None | Yes (box-shadow, text-shadow, blur) |
| Three feature cards in a row, bento grids | Content uses numbered lists, tables and two-column text | No |
| Emojis, em dashes | None in UI, docs or backend text | Yes |
| Inter, Geist, Space Grotesk | IBM Plex Sans and Plex Mono | Yes |
| Coloured left stripe | None | Yes |
| Fake testimonials | None | No |
| Terminal windows | None | No |
| "It's not X, it's Y" copy | Not used. Copy states what the product does and its limits | No |
| Checkmark bullets | Plain bullets and numbered steps | No |
| Three pricing tiers | No pricing. The product is free | No |
| No real product demo | `/demo` is the working tool, calling the real optimizer | No |
| Soft corner radius | 2px everywhere | Yes (over 4px fails) |
| No skeleton loaders | `components/Skeleton.tsx` | No |
| Animated arrows, hover animations | No arrows, no transitions. Hover changes colour only | Yes (transition, hover transform) |
| No Terms of Service or Privacy Policy | `/legal/terms`, `/legal/privacy` | No |
