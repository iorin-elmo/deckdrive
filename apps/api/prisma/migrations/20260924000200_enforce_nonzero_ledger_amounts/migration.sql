-- Pack purchases append negative ledger entries, while grants append positive
-- entries. Zero is never a meaningful currency movement.
ALTER TABLE "currency_transactions"
    ADD CONSTRAINT "currency_transactions_amount_nonzero" CHECK ("amount" <> 0);
