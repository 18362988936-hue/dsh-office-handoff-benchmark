# DSH Office Handoff Benchmark

[中文](#中文)

A reproducible regression case for DeepSeek Harness: a turn can finish successfully while
the files it leaves behind are missing or based on the wrong source revision. An
external scorer inspects the files, their contents and the original task constraints.
All inputs are synthetic. This is an independent benchmark, not an official plugin.

## Quick start

Requirements: Python 3.10+ for the offline checks. No API key, network access or Python
dependencies are needed for this step.

```sh
python3 -m unittest -v
```

For SDK replays, prepare the pinned DSH checkout following the
[setup guide](benchmark/UPSTREAM-REPLAY.md), then run:

```sh
./benchmark/replay-office.sh /path/to/pinned-deepseek-harness
./benchmark/replay-fresh-packet.sh /path/to/pinned-deepseek-harness
```

| Scripted case on DSH v0.2.3-alpha.2 `sdk` | Turn finish | Independent file verdict |
| --- | --- | --- |
| Continuous two-turn run | completed | Accepted |
| Clean shutdown and reopen with the same session ID | completed | Accepted |
| Injected no-write response | completed | Rejected: both required files missing |
| Fresh receiver, current packet (v2) | completed | Accepted |
| Fresh receiver, internally consistent old packet (v1) | completed | Rejected: totals, source revision and digest |

The scorer reads the actual CSV and handoff note, checks totals, cutoff date and cited
source, and verifies both source files against frozen digests. It does not read the
assistant's completion claim. The fresh receiver gets an explicit current-version requirement;
there is no sender chat import. These are deterministic provider replays on the real SDK.
The injected controls are not DSH defects. No live model, native Goal, official DS Handoff,
upgrade matrix or crash recovery is covered.

- [Protocol and reference checks](benchmark/PROTOCOL.md)
- [Same-session results](benchmark/OFFICE-REPLAY.md) and [structured record](benchmark/OFFICE-REPLAY-RESULT.json)
- [Fresh receiver results](benchmark/FRESH-PACKET-REPLAY.md)
- [Offline unknown-outcome calibration and separate upstream setup limits](benchmark/UNKNOWN-OUTCOME.md)

## 中文

**会话结束之后，交付物能不能验收？** 这套回归用例用合成订单测试 DSH：按指定日期与数据版本生成汇总 CSV 和交接说明，独立检查文件是否齐全、金额是否正确、来源可否追溯、原始数据有没有被改动。

离线验收：运行 `python3 -m unittest -v`，不需要 API 密钥。SDK 回放按[环境说明](benchmark/UPSTREAM-REPLAY.md)准备固定版本，再执行上面两条回放命令。

在固定版本的脚本回放中，连续执行、按原会话 ID 正常重启恢复均通过验收；人工注入缺文件后，SDK 仍返回 `completed`，独立评分器拒绝交付。两个新会话的接收测试也都返回 `completed`，但只有当前版数据包通过。结论限于这组可复跑用例，不代表在线模型质量、原生 Goal、官方 DS Handoff 或崩溃恢复。
