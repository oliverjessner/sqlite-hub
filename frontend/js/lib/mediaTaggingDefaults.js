export const MEDIA_TAGGING_DEFAULT_TAG_TABLE = 'media_tags';
export const MEDIA_TAGGING_DEFAULT_MAPPING_TABLE = 'media_asset_tags';
export const MEDIA_TAGGING_DEFAULT_TAG_TABLE_SQL = [
    'CREATE TABLE "media_tags" (',
    '  id INTEGER PRIMARY KEY,',
    '  name TEXT NOT NULL UNIQUE,',
    '  isParentTag INTEGER NOT NULL DEFAULT 0,',
    '  parentTagId INTEGER REFERENCES media_tags(id) ON DELETE SET NULL',
    ')',
].join('\n');
export const MEDIA_TAGGING_DEFAULT_MAPPING_TABLE_SQL = [
    'CREATE TABLE media_asset_tags (',
    '  media_asset_id INTEGER NOT NULL,',
    '  media_tag_id INTEGER NOT NULL,',
    '  PRIMARY KEY (media_asset_id, media_tag_id),',
    '  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,',
    '  FOREIGN KEY (media_tag_id) REFERENCES media_tags(id) ON DELETE CASCADE',
    ')',
].join('\n');

export function hasDefaultMediaTaggingTagTable(schemaTables = []) {
    return schemaTables.some(table => String(table?.name ?? '').trim() === MEDIA_TAGGING_DEFAULT_TAG_TABLE);
}

export function hasDefaultMediaTaggingMappingTable(schemaTables = []) {
    return schemaTables.some(table => String(table?.name ?? '').trim() === MEDIA_TAGGING_DEFAULT_MAPPING_TABLE);
}
