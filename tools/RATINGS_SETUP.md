# Loading ratings (Google Maps, TripAdvisor, Booking.com)

The page shows a rating tag next to a venue only when a real rating has been loaded for it. Venues without a loaded rating appear with no tag and are not filtered. Restaurants (Google, /5) and activities (TripAdvisor, /5) rated below 4.0 are hidden once they have 50+ reviews. Hotels show Booking.com (/10) as a tag only.

## 1. Restaurants: Google Places API (New)
1. Google Cloud Console: create a project and attach a billing account.
2. Enable **Places API (New)**. Create an API key and restrict it to that API.
3. Cost: about 560 Text Search requests per full run. Check the current Places pricing.

## 2. Activities: TripAdvisor Content API
1. Register at the TripAdvisor developer portal and request a Content API key.
2. About 400 searches + 400 detail calls per full run. Check current limits and pricing.
3. TripAdvisor requires attribution when you display its ratings.

## 3. Run (Node 18+)
```bash
GOOGLE_PLACES_API_KEY=... TRIPADVISOR_API_KEY=... node tools/update_ratings.mjs
```
Then commit and re-publish `index.html`. Unmatched places are listed in the output (they stay untagged).

## 4. Hotels: Booking.com
Booking.com publishes scores through the **Demand API** (`POST /3.2/accommodations/reviews/scores`), which is only open to Managed Affiliate Partners (contract with a Booking.com account manager, then affiliate ID + token from Partner Centre) and needs Booking.com's numeric hotel IDs. Scraping the website is against its terms and is blocked.

Without that access, use the spreadsheet route:
1. Open `tools/booking_template.csv` (135 hotels, each with a Booking.com search link).
2. Fill `score_out_of_10` and `review_count` from each hotel's Booking.com page.
3. `node tools/update_ratings.mjs --booking-csv=tools/booking_template.csv --only=none`
