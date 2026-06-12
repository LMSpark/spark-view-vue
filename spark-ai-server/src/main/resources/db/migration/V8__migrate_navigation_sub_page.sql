-- Migrate legacy sub-page navigation rows to nested config page shape:
-- nodeKind=page, hidden=true, path cleared (pageId resolves from NODE_ID).

UPDATE NAVIGATION_NODE_FLAT
SET NODE_KIND = 'page',
    HIDDEN = TRUE,
    PATH = NULL,
    UPDATED_AT = CURRENT_TIMESTAMP(6)
WHERE NODE_KIND = 'sub-page';
