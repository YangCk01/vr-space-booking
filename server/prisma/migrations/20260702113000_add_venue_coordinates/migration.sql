-- Add optional coordinates for distance-based venue sorting in the C-end picker.
ALTER TABLE "Venue" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Venue" ADD COLUMN "longitude" DOUBLE PRECISION;
