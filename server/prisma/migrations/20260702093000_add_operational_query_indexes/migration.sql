-- Composite indexes for high-frequency order, booking, payment, recharge, and ledger queries.
CREATE INDEX IF NOT EXISTS "Booking_venueId_date_status_idx" ON "Booking"("venueId", "date", "status");
CREATE INDEX IF NOT EXISTS "Booking_userId_date_idx" ON "Booking"("userId", "date");
CREATE INDEX IF NOT EXISTS "Booking_status_date_idx" ON "Booking"("status", "date");

CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_venueId_status_paidAt_idx" ON "Order"("venueId", "status", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_status_paidAt_idx" ON "Order"("status", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_orderKind_status_createdAt_idx" ON "Order"("orderKind", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "RechargeRecord_status_paidAt_idx" ON "RechargeRecord"("status", "paidAt");

CREATE INDEX IF NOT EXISTS "BalanceTransaction_type_createdAt_idx" ON "BalanceTransaction"("type", "createdAt");
