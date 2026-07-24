# Librarian / Book Categorizer

A camera-first home library organizer. Add front and/or back photos, confirm the
book details, and receive a precise shelf recommendation relative to books
already in the collection.

The app stores book metadata in Cloudflare D1 and private image originals in R2.
Its initial organizing rule groups by section, author, series, and title.

## Development

```bash
npm install
npm run dev
```

## Product direction

The interface is deliberately designed so vision-based book identification can
be added without changing the core workflow. The current first version keeps
the human confirmation step explicit and reliable.
