const modules = [
  { name: '笔记上传', detail: '支持截图、文字和链接输入', priority: 'P0' },
  { name: '诊断状态', detail: '承接异步任务进度和阶段文案', priority: 'P0' },
  { name: '诊断报告', detail: '展示评分、建议和 agent 结论', priority: 'P0' },
  { name: '诊断卡片', detail: '为分享和导出预留独立区域', priority: 'P0' },
]

function App() {
  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">NoteRx / 薯医</p>
          <h1>前端骨架已恢复</h1>
          <p className="hero-text">
            现在这个目录已经重新具备源码结构，可以直接继续做上传页、诊断流程页和报告页。
          </p>
        </div>
        <div className="hero-card">
          <p className="hero-card-label">当前状态</p>
          <ul>
            <li>Vite + React + TypeScript</li>
            <li>Tailwind v4 已接入</li>
            <li>可继续接 API 和 mock 数据</li>
          </ul>
        </div>
      </section>

      <section className="module-grid">
        {modules.map((module) => (
          <article key={module.name} className="module-card">
            <span className="module-priority">{module.priority}</span>
            <h2>{module.name}</h2>
            <p>{module.detail}</p>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App
