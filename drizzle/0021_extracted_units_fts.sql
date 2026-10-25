CREATE VIRTUAL TABLE `extracted_units_fts` USING fts5(text_content, unit_id UNINDEXED, workspace_id UNINDEXED, file_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `extracted_units_fts` (rowid, text_content, unit_id, workspace_id, file_id) SELECT rowid, text_content, id, workspace_id, file_id FROM `extracted_units`;
--> statement-breakpoint
CREATE TRIGGER `extracted_units_fts_after_insert` AFTER INSERT ON `extracted_units` BEGIN INSERT OR REPLACE INTO `extracted_units_fts` (rowid, text_content, unit_id, workspace_id, file_id) VALUES (new.rowid, new.text_content, new.id, new.workspace_id, new.file_id); END;
--> statement-breakpoint
CREATE TRIGGER `extracted_units_fts_after_delete` AFTER DELETE ON `extracted_units` BEGIN DELETE FROM `extracted_units_fts` WHERE rowid = old.rowid AND unit_id = old.id; END;
--> statement-breakpoint
CREATE TRIGGER `extracted_units_fts_after_update` AFTER UPDATE ON `extracted_units` BEGIN DELETE FROM `extracted_units_fts` WHERE rowid = old.rowid AND unit_id = old.id; INSERT OR REPLACE INTO `extracted_units_fts` (rowid, text_content, unit_id, workspace_id, file_id) VALUES (new.rowid, new.text_content, new.id, new.workspace_id, new.file_id); END;
