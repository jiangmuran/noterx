# 项目中控文件
## 项目介绍
本项目系

<!-- OMX:RUNTIME:START -->
<session_context>
**Session:** omx-1775748100507-s6qwb6 | 2026-04-09T15:21:41.049Z

**Codebase Map:**
  frontend/: eslint.config, App, AgentDebate, BaselineComparison, CategoryPicker, DiagnoseCard, DimensionBars, ErrorBoundary, RadarChart, ScoreCard

**Explore Command Preference:** enabled via `USE_OMX_EXPLORE_CMD` (default-on; opt out with `0`, `false`, `no`, or `off`)
- Advisory steering only: agents SHOULD treat `omx explore` as the default first stop for direct inspection and SHOULD reserve `omx sparkshell` for qualifying read-only shell-native tasks.
- For simple file/symbol lookups, use `omx explore` FIRST before attempting full code analysis.
- When the user asks for a simple read-only exploration task (file/symbol/pattern/relationship lookup), strongly prefer `omx explore` as the default surface.
- Explore examples: `omx explore...

**Compaction Protocol:**
Before context compaction, preserve critical state:
1. Write progress checkpoint via state_write MCP tool
2. Save key decisions to notepad via notepad_write_working
3. If context is >80% full, proactively checkpoint state
</session_context>
<!-- OMX:RUNTIME:END -->
