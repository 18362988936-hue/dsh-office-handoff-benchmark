# Fresh receiver: explicit handoff packet, scripted replay

Reproduce from project root with the prepared Linux checkout in
[UPSTREAM-REPLAY.md](UPSTREAM-REPLAY.md):

```sh
./benchmark/replay-fresh-packet.sh /path/to/pinned-deepseek-harness
```

DSH v0.2.3-alpha.2, keyless SDK source launcher. Each treatment starts an
independent fresh receiver session, DSH home and packet workspace; no sender
chat or existing session is imported. The controller stages synthetic CSV
inputs and candidate outputs; the oracle and scorer are not included in
the packet. The same receiver prompt independently names v2 as authoritative.
A scripted real shell tool checks the declared source revision and the
simulated response consumes its observed result. Independently, the external
scorer recomputes the verdict against the frozen contract. Both packet file
names and bytes are unchanged. Distinct nonempty receiver IDs are asserted.

| Packet | SDK finish | Scripted revision check | Independent scorer |
|---|---|---|---|
| Matching v2 | completed | MATCHING_REVISION | accepted |
| Internally coherent v1 | completed | STALE_REVISION | rejected: totals, source, digest |

Observed 2/2 passing, 5.12 s total. The stale packet deliberately uses its
true source digest and valid v1 totals (1848/2675); v2 totals are 1848/2725.
The receiver revision check is narrower than the full scoring contract.

This is a fresh receiver over files staged by a test controller. It is not
a live model, evidence of reasoning quality, an implemented sender, native
Goal, official DS Handoff, or an OS security-isolation test. Same-ID reopen
remains separately covered by OFFICE-REPLAY.md.
