import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { tokenizeQuery } from "@/lib/search/tokenizer";

describe("tokenizeQuery (FTS5 MATCH safety)", () => {
  function matchAgainst(query: string, indexed: string[]): unknown[] {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE VIRTUAL TABLE t USING fts5(x)");
      const insert = db.prepare("INSERT INTO t(x) VALUES (?)");
      for (const row of indexed) insert.run(row);
      const match = tokenizeQuery(query);
      expect(match).not.toBe("");
      return db.prepare("SELECT * FROM t WHERE t MATCH ?").all(match);
    } finally {
      db.close();
    }
  }

  it("accepts queries containing ASCII quotes, brackets and parentheses", () => {
    const rows = matchAgainst('OpenGauss ["分布式"] (数据库)', [
      "OpenGauss 分布式 数据库",
      "PostgreSQL 关系型 数据库",
    ]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("accepts a lone double-quote token", () => {
    expect(() => matchAgainst('a "b', ["a b c"])).not.toThrow();
  });

  it("still builds a plain OR expression for short queries", () => {
    expect(tokenizeQuery("网络 拓扑")).toBe('"网络" OR "拓扑"');
  });
});
