# Account migration generation

Account PostgreSQL migrations are separate from the legacy SQLite migrations.
`drizzle-accounts/*.sql` and `meta/_journal.json` are the executable history;
`meta/*_snapshot.json` records the generator's schema after each corresponding SQL migration.

Generation is offline and does not require an account environment file, database URL or secret:

```bash
npm run accounts:generate
```

Review every generated statement before adding a migration. Explicit application of a migration
uses `scripts/account-migrate.mjs` with the separately authorized target configuration; application
startup does not apply migrations. Do not run migration or schema push commands against the daily
instance as part of generation or a normal app update.

After an intentional schema change and its reviewed migration, run:

```bash
npm run check:account-migrations
```

The check validates the journal/snapshot chain and compares the latest snapshot with the current
schema. It also runs the locked Drizzle CLI twice in a temporary directory, without account or
PostgreSQL configuration, and requires both passes to leave all copied migration files unchanged.
`npm run test:migrations` includes corruption and schema drift regression tests.

The restored 0002–0006 snapshots describe already existing SQL. Unique constraints, foreign key
names, CHECK names and descending index ordering follow that history; no SQL or journal timestamp
is rewritten. A metadata repair does not run a migration or modify stored data. Reverting the
metadata repair needs no database rollback, but restores the generation gap.

Drizzle snapshots do not fully represent the hand-written publication functions and immutable
revision trigger. Keep those SQL definitions and the PostgreSQL behavior tests. A clean generator
comparison does not prove that a running database matches the migration history, and does not
replace migration replay, concurrency or backup/restore acceptance.
