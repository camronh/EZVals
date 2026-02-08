.PHONY: setup-skills serve-testing docs

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

docs:
	@port=3000; \
	while lsof -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; do \
		port=$$((port + 1)); \
	done; \
	echo "Starting Mintlify docs on port $$port"; \
	cd docs && mintlify dev --port $$port
