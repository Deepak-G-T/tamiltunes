-- Emails are compared without caring about case or outer spaces. Safe to run twice.
-- If two accounts would become the same email after cleaning, NOTHING is changed (the deploy must not fail because of data):
-- the notice below says so, and `npm run report:email-collisions --prefix backend` lists them for a manual decision.
DO $$
DECLARE clashes integer;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT lower(btrim("email")) FROM "users" GROUP BY 1 HAVING count(*) > 1
  ) c;

  IF clashes > 0 THEN
    RAISE NOTICE 'email_lower_unique: % group(s) of accounts share an email once case and spaces are ignored; emails were NOT changed and the unique index was NOT created. Run the collision report and merge them by hand.', clashes;
  ELSE
    UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
    CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_key" ON "users" (lower("email"));
  END IF;
END $$;
