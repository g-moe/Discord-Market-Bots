import * as fs from "fs";
import * as path from "path";
import { DatabaseSync } from "node:sqlite";
import { NEWS_HEADLINES_TABLE_SQL, NewsHeadline, NewsHeadlineRow } from "./news-headline-schema";

export type NewsHeadlineStore = {
  readonly deletePublishedBefore: (publishedBeforeMs: number) => number;
  readonly insertUnseen: (headlines: readonly NewsHeadline[]) => number;
  readonly listUnpostedSince: (publishedSinceMs: number) => readonly NewsHeadline[];
  readonly markPosted: (params: { id: string; postedAt: number }) => void;
};

/**
 * Open (or create) the SQLite headline store at `dbPath`, creating its directory if needed.
 * Pass `":memory:"` for a store that lives only as long as the process.
 *
 * @example
 * const store = createNewsHeadlineStore({ dbPath: ":memory:" });
 * store.insertUnseen([{ date: Date.now(), id: "1", important: true, title: "Fed holds" }]); // 1
 * store.insertUnseen([{ date: Date.now(), id: "1", important: true, title: "Fed holds" }]); // 0
 */
export function createNewsHeadlineStore({ dbPath }: { dbPath: string }): NewsHeadlineStore {
  const IN_MEMORY_DB_PATH = ":memory:";

  if (dbPath !== IN_MEMORY_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(NEWS_HEADLINES_TABLE_SQL);

  const insert = db.prepare("INSERT OR IGNORE INTO news_headlines (id, date, title, important) VALUES (?, ?, ?, ?)");
  const selectUnposted = db.prepare(
    "SELECT id, date, title, important FROM news_headlines WHERE posted_at IS NULL AND date >= ? ORDER BY date ASC",
  );
  const updatePosted = db.prepare("UPDATE news_headlines SET posted_at = ? WHERE id = ?");
  const deleteOld = db.prepare("DELETE FROM news_headlines WHERE date < ?");

  return {
    deletePublishedBefore: publishedBeforeMs => Number(deleteOld.run(publishedBeforeMs).changes),

    insertUnseen: headlines => {
      let inserted = 0;

      db.exec("BEGIN");
      try {
        for (const { date, id, important, title } of headlines) {
          inserted += Number(insert.run(id, date, title, important ? 1 : 0).changes);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return inserted;
    },

    listUnpostedSince: publishedSinceMs => selectUnposted.all(publishedSinceMs).map(row => NewsHeadlineRow.parse(row)),

    markPosted: ({ id, postedAt }) => {
      updatePosted.run(postedAt, id);
    },
  };
}
