.PHONY: build ui host test docs setup-skills sync-skill-sandbox

VERSION := $(shell sed -n 's/^version = "\(.*\)"/\1/p' python/pyproject.toml)
BINARY := python/ezvals/bin/ezvals

# Build the UI, then the host binary (with the UI and skill embedded) into the Python package.
build: ui host

ui:
	cd ui && npm ci --silent && npm run build

host:
	rm -rf cmd/ezvals/skill/ezvals-docs && mkdir -p cmd/ezvals/skill/ezvals-docs
	cp docs/introduction.mdx docs/examples/*.mdx docs/core-concepts/*.mdx docs/guides/*.mdx docs/api-reference/*.mdx cmd/ezvals/skill/ezvals-docs/
	cp docs/setup.mdx cmd/ezvals/skill/ezvals-docs/quickstart.mdx
	go build -ldflags "-X main.version=$(VERSION)" -o $(BINARY) ./cmd/ezvals
	cd python && uv sync --quiet
	cd typescript && npm ci --silent && npm run build

test: host
	go test ./...
	cd python && uv run pytest -q
	cd typescript && npm test

docs:
	cd docs && npx mintlify dev

setup-skills:
	@mkdir -p .claude/skills .codex/skills
	@for skill in .agents/skills/*/; do \
		name=$$(basename "$$skill"); \
		ln -sf "../../.agents/skills/$$name" ".claude/skills/$$name"; \
		ln -sf "../../.agents/skills/$$name" ".codex/skills/$$name"; \
	done

sync-skill-sandbox: host
	rm -rf skills-sandbox/sandbox/.claude/skills/evals && mkdir -p skills-sandbox/sandbox/.claude/skills
	cp -r cmd/ezvals/skill skills-sandbox/sandbox/.claude/skills/evals
