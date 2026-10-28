-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_document_atoms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "span_id" TEXT,
    "block_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER,
    "heading_path" TEXT,
    "heading_level" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "char_start" INTEGER,
    "char_end" INTEGER,
    "text_preview" TEXT,
    "keywords" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_atoms_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_document_atoms" ("block_type", "char_end", "char_start", "content", "created_at", "document_id", "heading_level", "heading_path", "id", "index", "keywords", "page_end", "page_start", "span_id", "text_preview", "token_count") SELECT "block_type", "char_end", "char_start", "content", "created_at", "document_id", "heading_level", "heading_path", "id", "index", "keywords", "page_end", "page_start", "span_id", "text_preview", "token_count" FROM "document_atoms";
DROP TABLE "document_atoms";
ALTER TABLE "new_document_atoms" RENAME TO "document_atoms";
CREATE INDEX "document_atoms_document_id_index_idx" ON "document_atoms"("document_id", "index");
CREATE TABLE "new_document_segments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "start_atom_index" INTEGER NOT NULL,
    "end_atom_index" INTEGER NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "heading_path" TEXT,
    "token_count" INTEGER,
    "content_path" TEXT,
    "source_atom_ids" TEXT NOT NULL DEFAULT '[]',
    "source_chunk_ids" TEXT,
    "segmentation_method" TEXT NOT NULL DEFAULT 'llm',
    "segmentation_reason" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "content_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "document_segments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_document_segments" ("confidence", "content_hash", "content_path", "created_at", "document_id", "end_atom_index", "heading_path", "id", "index", "page_end", "page_start", "segmentation_method", "segmentation_reason", "source_atom_ids", "source_chunk_ids", "start_atom_index", "summary", "title", "token_count", "updated_at") SELECT "confidence", "content_hash", "content_path", "created_at", "document_id", "end_atom_index", "heading_path", "id", "index", "page_end", "page_start", "segmentation_method", "segmentation_reason", "source_atom_ids", "source_chunk_ids", "start_atom_index", "summary", "title", "token_count", "updated_at" FROM "document_segments";
DROP TABLE "document_segments";
ALTER TABLE "new_document_segments" RENAME TO "document_segments";
CREATE INDEX "document_segments_document_id_index_idx" ON "document_segments"("document_id", "index");
CREATE TABLE "new_model_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "context_window" INTEGER NOT NULL DEFAULT 0,
    "max_output_tokens" INTEGER,
    "supports_streaming" BOOLEAN NOT NULL DEFAULT true,
    "input_price" REAL,
    "output_price" REAL,
    "local_or_cloud" TEXT NOT NULL DEFAULT 'local',
    "is_default_for" TEXT,
    "embedding_dim" INTEGER,
    "embedding_batch_size" INTEGER DEFAULT 10,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_providers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_model_configs" ("capabilities", "context_window", "created_at", "embedding_batch_size", "embedding_dim", "id", "input_price", "is_default_for", "local_or_cloud", "max_output_tokens", "model_id", "model_name", "output_price", "provider_id", "supports_streaming") SELECT "capabilities", "context_window", "created_at", "embedding_batch_size", "embedding_dim", "id", "input_price", "is_default_for", "local_or_cloud", "max_output_tokens", "model_id", "model_name", "output_price", "provider_id", "supports_streaming" FROM "model_configs";
DROP TABLE "model_configs";
ALTER TABLE "new_model_configs" RENAME TO "model_configs";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineIndex
DROP INDEX "wiki_entries_user_id_slug_idx";
CREATE UNIQUE INDEX "wiki_entries_user_id_slug_key" ON "wiki_entries"("user_id", "slug");

-- RedefineIndex
DROP INDEX "wiki_links_from_id_to_id_relation_idx";
CREATE UNIQUE INDEX "wiki_links_from_id_to_id_relation_key" ON "wiki_links"("from_id", "to_id", "relation");
