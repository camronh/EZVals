package main

import "os/exec"

func isolate(cmd *exec.Cmd) {}

func kill(cmd *exec.Cmd) { cmd.Process.Kill() }
