setup-skills:
	@mkdir -p .claude/skills .codex/skills
	@for skill in .agents/skills/*/; do \
		name=$$(basename "$$skill"); \
		ln -sf "../../.agents/skills/$$name" ".claude/skills/$$name"; \
		ln -sf "../../.agents/skills/$$name" ".codex/skills/$$name"; \
	done
	@echo "Done. Skills linked for claude and codex."
