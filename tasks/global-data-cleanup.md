# CityCatalyst-global-data — agent-friendly tasks

Run against `REPO_PATH=../CityCatalyst-global-data BASE_BRANCH=develop`.

## Update README to reference knowledge-base/ instead of domain-knowledge/

- **type**: docs
- **description**: The repo's `README.md` still describes a `domain-knowledge/` folder, but the actual folder is now `knowledge-base/`. Update the layout block and any prose references. Don't add new sections; just align with the current tree.
- **files**: README.md

### Acceptance criteria

- Layout block lists `knowledge-base/` (not `domain-knowledge/`).
- All references to `domain-knowledge` are updated.
- The file remains accurate against the current tree.

## Fix typo in knowledge-base/catalog/index.yaml

- **type**: docs
- **description**: `knowledge-base/catalog/index.yaml` references `items/climate-projec.md` (missing the `t`). The actual file is `topics/climate-project.md`. Fix the path so the catalog points at the real file.
- **files**: knowledge-base/catalog/index.yaml

### Acceptance criteria

- The path resolves to an existing file.
- No other entries are touched.

## Seed knowledge-base/topics/glossary.md

- **type**: docs
- **description**: `knowledge-base/topics/glossary.md` is empty. Seed it with concise definitions for: GPC, GHGI, CCRA, HIAP, MEED, locode, actor_id, datasource_name, gpc_reference_number, gpcmethod_id, modelled, raw_data, release_id. Pull definitions from `AGENTS.md` and `engineering-standards/data-model-design.md` — do not invent new terms.
- **files**: knowledge-base/topics/glossary.md

### Acceptance criteria

- Each term has a 1–3 sentence definition.
- Terms link to the relevant doc when one exists.
- No invented or speculative entries.

## Audit cc-mage/requirements.txt vs imports

- **type**: improvement
- **description**: Several blocks under `cc-mage/` import `boto3`, `requests`, `sqlalchemy` but those packages are not in `cc-mage/requirements.txt` — they're satisfied by the Mage base image. List what's actually imported in `cc-mage/{data_loaders,transformers,data_exporters,utils}/**/*.py`, deduplicate, and add the missing entries to `requirements.txt` with the version currently used in the base image.
- **files**: cc-mage/requirements.txt

### Acceptance criteria

- All third-party imports in `cc-mage/**/*.py` are represented in `requirements.txt`.
- Versions pin to what the Mage base image currently provides (don't guess; check the image).
- The Docker build still succeeds.
