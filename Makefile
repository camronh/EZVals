.PHONY: setup-skills serve-testing docs sync-skill-poc

setup-skills:
	@mkdir -p .claude/skills .codex/skills
	@for skill in .agents/skills/*/; do \
		name=$$(basename "$$skill"); \
		ln -sf "../../.agents/skills/$$name" ".claude/skills/$$name"; \
		ln -sf "../../.agents/skills/$$name" ".codex/skills/$$name"; \
	done
	@echo "Done. Skills linked for claude and codex."

serve-testing:
	uv run ezvals serve examples --session testing

POC_SKILL_DIR := $(HOME)/Documents/Dev/agent-skill-eval-poc/sandbox/.claude/skills/evals
SKILL_SRC := ezvals/skills/evals

sync-skill-poc:
	@echo "Assembling ezvals-docs from docs/..."
	@mkdir -p $(SKILL_SRC)/ezvals-docs
	@cp docs/introduction.mdx $(SKILL_SRC)/ezvals-docs/
	@cp docs/setup.mdx $(SKILL_SRC)/ezvals-docs/quickstart.mdx
	@cp docs/examples/*.mdx $(SKILL_SRC)/ezvals-docs/
	@cp docs/core-concepts/*.mdx $(SKILL_SRC)/ezvals-docs/
	@cp docs/guides/*.mdx $(SKILL_SRC)/ezvals-docs/
	@cp docs/api-reference/*.mdx $(SKILL_SRC)/ezvals-docs/
	@echo "Syncing skill to POC sandbox..."
	@rm -rf $(POC_SKILL_DIR)
	@mkdir -p $(POC_SKILL_DIR)
	@cp -r $(SKILL_SRC)/* $(POC_SKILL_DIR)/
	@echo "Done. $(shell ls $(POC_SKILL_DIR)/ezvals-docs/*.mdx 2>/dev/null | wc -l | tr -d ' ') docs synced."

docs:
	@port=3000; \
	while lsof -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; do \
		port=$$((port + 1)); \
	done; \
	echo "Starting Mintlify docs on port $$port"; \
	cd docs && mintlify dev --port $$port
