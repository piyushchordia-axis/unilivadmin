## DB migrations

Day-to-day development uses `drizzle-kit push` (see `package.json`'s `push` /
`push-force` scripts) to sync `src/schema/*` to the database. For environments
where push isn't appropriate (e.g. production), the SQL files in this directory
capture each schema change in order so they can be applied manually with `psql`
or any standard runner.

Apply in lexicographic order:

```bash
psql "$DATABASE_URL" -f lib/db/migrations/0001_portfolio_types.sql
```
