Title: chore: move C# and Java projects to external archive

Summary
-------
Move several C# and Java helper projects and generated data out of the main repository into an external archive directory to reduce repo size and remove generated artifacts from version control.

Archive location
---------------
E:\\spark-view-archives\\20260131_023741

What changed
------------
- Moved projects/directories to archive (kept local archive copy):
  - 沙市区二轮延包基础数据/2.农经权/矢量数据/AccessToJson
  - 沙市区二轮延包基础数据/2.农经权/矢量数据/AccessReader
  - 沙市区二轮延包基础数据/2.农经权/矢量数据/ShapefileReader
  - 沙市区二轮延包基础数据/2.农经权/矢量数据/ShapefileReaderJava
  - 沙市区二轮延包基础数据/2.农经权/矢量数据/AccessReaderJava
  - SanziProcessor
  - Root-level PdfToJsonSanzi.csproj and Program.cs
- Removed generated JSON tables and large build artifacts from the repository index and added .gitignore rules to prevent future commits of these files. See commits in branch `refactor/core-solid-step-1-singletons`.

Why
---
- These helper projects and generated data are large and are not required to be tracked in the main repo, causing repository bloat and slowing operations.

Impact & Risks
--------------
- The moved projects are no longer available in the repository working tree but are preserved in the archive directory on the same machine.
- If anyone needs the moved code, they can restore it from `E:\\spark-view-archives\\20260131_023741` and re-add it as necessary.
- CI or automation that expected these projects in the repo root may break until workflows are updated.

Rollback
--------
1. Recover the specific project folder from the archive directory and move it back into the repo. 2. git add/commit the restoration. 3. Push to remote or create a branch to revert the removal commit.

Suggested reviewers
-------------------
- @team-lead
- @repo-maintainer

Checklist
---------
- [x] Archive created and files moved
- [x] .gitignore updated
- [x] Generated JSON tables removed from repo
- [ ] Update any CI/workflow that depended on moved projects

Notes
-----
If you prefer I can also create the actual Pull Request on Gitee; I need either your authorization or an API token to create it programmatically. Alternatively, you can copy this content into a PR at https://gitee.com/obslight/SPARK_VIEW/pulls/new (branch: refactor/core-solid-step-1-singletons).
