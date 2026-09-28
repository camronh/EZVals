package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

//go:embed all:skill
var skillFiles embed.FS

var agents = []string{"claude", "codex", "cursor", "windsurf", "kiro", "roo"}

func skillPath(base, agent string) string { return filepath.Join(base, "."+agent, "skills", "evals") }

func installSkill(dst string) error {
	if err := os.RemoveAll(dst); err != nil {
		return err
	}
	src, _ := fs.Sub(skillFiles, "skill")
	return os.CopyFS(dst, src)
}

func skillsCmd(args []string) {
	if len(args) == 0 {
		fatal("usage: ezvals skills add|remove|doctor [--global] [agent flags]")
	}
	fs := newFlagSet("skills " + args[0])
	global := fs.Bool("global", false, "use the home directory instead of the current directory")
	fs.BoolVar(global, "g", false, "shorthand for --global")
	useAgentsDir := fs.Bool("agents", false, "install the canonical copy in .agents/")
	selected := map[string]*bool{}
	for _, agent := range agents {
		selected[agent] = fs.Bool(agent, false, "install for ."+agent+"/")
	}
	parseFlags(fs, args[1:])
	base, _ := os.Getwd()
	if *global {
		base, _ = os.UserHomeDir()
	}

	switch args[0] {
	case "add":
		var targets []string
		for _, agent := range agents {
			if *selected[agent] {
				targets = append(targets, agent)
			}
		}
		if !*useAgentsDir && len(targets) == 0 {
			fatal("Please specify at least one agent target flag (e.g. --claude, --codex, --agents).")
		}
		canonical := "agents"
		if !*useAgentsDir {
			canonical = targets[0]
		}
		source := skillPath(base, canonical)
		if err := installSkill(source); err != nil {
			fatal("%v", err)
		}
		var linked []string
		for _, agent := range targets {
			link := skillPath(base, agent)
			if link == source {
				continue
			}
			os.RemoveAll(link)
			os.MkdirAll(filepath.Dir(link), 0o755)
			relative, _ := filepath.Rel(filepath.Dir(link), source)
			if os.Symlink(relative, link) != nil {
				if err := installSkill(link); err != nil {
					fatal("%v", err)
				}
			}
			linked = append(linked, "."+agent)
		}
		fmt.Printf("Evals skill v%s installed:\n  Source: .%s/skills/evals/\n", skillVersion(source), canonical)
		if len(linked) > 0 {
			fmt.Printf("  Linked: %s\n", strings.Join(linked, ", "))
		}
		if canonical == "agents" && !*global {
			exclude := filepath.Join(base, ".git", "info", "exclude")
			if existing, err := os.ReadFile(exclude); err == nil && !strings.Contains(string(existing), ".agents/") {
				os.WriteFile(exclude, append(existing, []byte("\n.agents/\n")...), 0o644)
				fmt.Println("\nNote: Added .agents/ to .git/info/exclude")
			}
		}
		fmt.Println("\nInvoke with /evals in your agent.")

	case "remove":
		var removed []string
		for _, agent := range append(agents, "agents") {
			path := skillPath(base, agent)
			if _, err := os.Lstat(path); err == nil {
				os.RemoveAll(path)
				removed = append(removed, "."+agent)
			}
		}
		if len(removed) == 0 {
			fmt.Println("No evals skill installation found.")
			return
		}
		fmt.Printf("Removed evals skill from: %s\n", strings.Join(removed, ", "))

	case "doctor":
		fmt.Printf("EZVals Skill Doctor\n%s\nPackage version: %s\n\n", strings.Repeat("─", 20), version)
		if *global {
			fmt.Println("Global (~/)")
		} else {
			fmt.Printf("Project (%s/)\n", filepath.Base(base))
		}
		canonical := ""
		for _, agent := range append([]string{"agents"}, agents...) {
			if info, err := os.Lstat(skillPath(base, agent)); err == nil && info.IsDir() && canonical == "" {
				canonical = agent
			}
		}
		if canonical == "" {
			fmt.Println("  No evals skill found.")
		} else {
			source := skillPath(base, canonical)
			fmt.Printf("  Source: .%s/skills/evals/  ✓ v%s\n  Symlinks:\n", canonical, skillVersion(source))
			for _, agent := range agents {
				path := skillPath(base, agent)
				if agent == canonical {
					continue
				}
				status := "✗ not installed"
				if info, err := os.Lstat(path); err == nil {
					resolved, _ := filepath.EvalSymlinks(path)
					sourceResolved, _ := filepath.EvalSymlinks(source)
					switch {
					case info.Mode()&os.ModeSymlink == 0:
						status = "⚠ copy (not symlink)"
					case resolved == sourceResolved:
						status = "✓ linked"
					default:
						status = "⚠ linked elsewhere"
					}
				}
				fmt.Printf("    .%s/skills/evals    %s\n", agent, status)
			}
		}
		fmt.Println("\nRun 'ezvals skills add --claude' (or your chosen target flags) to install or fix.")

	default:
		fatal("unknown skills command %q (use add, remove or doctor)", args[0])
	}
}

var versionComment = regexp.MustCompile(`Version:\s*([0-9.]+)`)

func skillVersion(dir string) string {
	data, _ := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if m := versionComment.FindSubmatch(data); m != nil {
		return string(m[1])
	}
	return "?"
}
