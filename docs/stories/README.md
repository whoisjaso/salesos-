# Story map

Epics follow the roadmap phases. Each story names its governing spec module and acceptance test source (SOS-26 where applicable).

## Epic 1: Domain core
- 1.1 Entity types per SOS-03 with `tenant_id` on every business object.
- 1.2 Metric engine M01 to M21 per SOS-02 returning `MetricPayload`. N/A on zero denominator. Team rate is sum/sum.
- 1.3 Attendance denominator: eligible, matured, unknown lower and upper bounds (SOS-02, SOS-12).
- 1.4 Glow policy per SOS-20: benchmark plus sample threshold plus data state, favorable direction, non-monotonic stages neutral.
- 1.5 Routing precedence per SOS-06 with explanation string and shadow-mode logging for steps 6 and 7.
- 1.6 Capacity load estimate per SOS-06.
- 1.7 Coaching engine per SOS-16: stage-to-action library, scenario with explicit assumptions and capacity cap.
- 1.8 Leaderboard views per SOS-14: economic output, comparable, personal progress; provisional states; movement reasons.
- 1.9 Fixtures: SOS-01 corrected two-column sheet plus full twelve-column August reading, plus a synthetic operational cohort for Obavia.
- 1.10 Vitest coverage of the acceptance criteria listed in each module.

## Epic 2: Design system and shell
- 2.1 Tokens: off-black surfaces, one accent, three performance hues at low saturation.
- 2.2 FunnelCard with connector, denominator reveal, data-state chip.
- 2.3 MetricTile with labeled basis.
- 2.4 CountUp and enter animations, disabled under reduced motion.
- 2.5 Shell: role switcher, left rail, mobile bottom tabs.

## Epic 3: Owner
- 3.1 Trust layer strip. 3.2 Economics row. 3.3 Comparable funnel. 3.4 Capacity. 3.5 Bottleneck cards with owner assignment. 3.6 Benchmark scenario labeled, no debt framing. 3.7 Source-reproduction view of the August sheet with corrected labels.

## Epic 4: Setter and closer
- 4.1 Setter next-action hero. 4.2 Queue with priority reason. 4.3 Call state machine (lease, ringing, connected, ended, proposed summary, confirm). 4.4 Booking with lineage. 4.5 Handoff brief. 4.6 Closer pre-call brief with evidence labels. 4.7 Live checklist. 4.8 Follow-up queue by type. 4.9 Financial state ladder (verbal, signed, authorized, collected, delivered).

## Epic 5: Team
- 5.1 Three leaderboard views. 5.2 Provisional and tier chips. 5.3 Missions with evidence rule. 5.4 Skill paths. 5.5 Seasons display layer. 5.6 Coaching card page. 5.7 Optional personal milestone (777) as private setting.

## Epic 6: Persistence
- 6.1 Supabase migration. 6.2 Repository interface. 6.3 Memory adapter (default). 6.4 Supabase adapter behind env. 6.5 Provider event inbox with idempotency test.
