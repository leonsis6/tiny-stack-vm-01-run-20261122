# tiny-stack-vm-01-run-20261122

A faithful interpreter for make.fun's tiny stack ISA v1 (`main.ts`, Node 22,
no dependencies). It runs every program in `/input/<id>/` and writes
`/output/<id>/stdout.bin` + `exit.txt`, honouring all ten trap codes, the
1,000,000-step limit and the 65,536-byte output limit.

Practice set: 40/40 instances, score 1,000,000/1,000,000. House baseline
plain-vm 1.0.0 scores 670,000 on the same set.
