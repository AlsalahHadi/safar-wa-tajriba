# سفر وتجربة — Travel & Experience

Single-page Arabic (RTL) travel agency site: five travel styles (luxury, budget, family, business, education), live package filters, trip builder, budget estimator, and an English-study cost calculator (Oxford International 2027 list, +20%).

Plain HTML/CSS/JS in one file (`index.html`), no build step. Served by GitHub Pages from the `main` branch root.

Exchange rates and prices are fixed inside the page; update the `FXU` constant and package data in `index.html` when they change.

## Rating rule (4.0+)

The itinerary planner only suggests **restaurants rated 4.0+ on Google Maps** and **activities rated 4.0+ on TripAdvisor**, whenever the place has **50 or more reviews** (places with fewer reviews are exempt).

Ratings are loaded into `index.html` (the `RTD` table) by `tools/update_ratings.mjs`:

```bash
GOOGLE_PLACES_API_KEY=... TRIPADVISOR_API_KEY=... node tools/update_ratings.mjs
```

Until ratings are loaded the page shows every venue labelled "rating not verified"; once the table has any data, unverified venues are hidden. Check the Google Maps Platform and TripAdvisor terms on storing/displaying ratings before publishing.
