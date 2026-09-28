//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// Workers get their own process group so stopping one also stops anything the evals started.
func isolate(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} }

func kill(cmd *exec.Cmd) { syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
