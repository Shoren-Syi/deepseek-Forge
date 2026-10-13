import type { PropsLocale, PropsRuntime, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-deliverables/src/client/turn-deliverables.ts'
import css from './forge.module.css'
import { useForgeFacts } from './Inspector.tsx'

export interface WorkbenchActions {
  openProjects: () => void
  openFiles: () => void
  openSettings: () => void
  openAuxiliary: () => void
  openTerminal: (sessionId: PropsRuntime<'conversation.session.header.actions'>['sessionId'], signal: AbortSignal) => Promise<void>
  openDiff: (sessionId: PropsRuntime<'conversation.session.header.actions'>['sessionId'], seq: number, turn: number) => void
}

/** 工具导航继承框架的当前会话绑定，切换项目后不会保留旧会话标识。 */
export function FooterHost({ renderSlot, SessionProvider }: PropsRuntime<'shell.bottom'> & PropsRenderSlots<'forge.workbench.footer'>) {
  return <SessionProvider>{renderSlot('forge.workbench.footer', {})}</SessionProvider>
}

/** 固定检查器绑定主会话，与工具分屏的选中页无关。 */
export function FixedInspectorHost({ renderSlot, SessionProvider }: PropsRuntime<'shell.overlay'> & PropsRenderSlots<'forge.inspector.fixed'>) {
  return <aside className={css.fixedInspector} data-forge-fixed-inspector tabIndex={-1}><SessionProvider>{renderSlot('forge.inspector.fixed', {})}</SessionProvider></aside>
}

/** 未打开工具时保留明确的工作区与操作入口。 */
export function ToolsPlaceholderHost({ renderSlot, SessionProvider }: PropsRuntime<'shell.overlay'> & PropsRenderSlots<'forge.tools.placeholder'>) {
  return <div className={css.toolsPlaceholder} data-forge-tools-placeholder><SessionProvider>{renderSlot('forge.tools.placeholder', {})}</SessionProvider></div>
}

export function ToolsPlaceholder({ t, openFiles, openAuxiliary }: PropsRuntime<'forge.tools.placeholder'> & PropsLocale<'forge'> & InjectFace<WorkbenchActions>) {
  return <><h2>{t('toolsArea')}</h2><p>{t('toolsHelp')}</p><nav className={css.toolbar}><button type="button" onClick={openFiles}>{t('files')}</button><button type="button" onClick={openAuxiliary}>{t('auxiliary')}</button></nav></>
}

export function Footer(props: PropsRuntime<'forge.workbench.footer'> & PropsLocale<'forge'> & InjectFace<WorkbenchActions>) {
  const { sessionId, useConversation, openFiles, openSettings, openTerminal, openDiff, t } = props
  const [terminal, setTerminal] = useState<{ phase: 'idle' | 'opening' } | { phase: 'error'; message: string }>({ phase: 'idle' })
  useEffect(() => {
    if (terminal.phase !== 'opening') return
    const lifetime = new AbortController()
    void openTerminal(sessionId, lifetime.signal).then(() => {
      if (!lifetime.signal.aborted) setTerminal({ phase: 'idle' })
    }, (error: unknown) => {
      if (!lifetime.signal.aborted) setTerminal({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { lifetime.abort() }
  }, [terminal.phase, sessionId, openTerminal])
  const chat = useConversation(value => value.views.get('chat'))
  const changedTurn = chat?.timeline.turnOrder.toReversed().find(id => chat.timeline.turns.get(id)?.data.get('deliverables')?.changes)
  const changes = changedTurn === undefined ? undefined : chat?.timeline.turns.get(changedTurn)?.data.get('deliverables')?.changes
  return (
    <div data-forge-session={sessionId}>
    <div className={css.toolsNavigation}>
    <nav className={css.toolbar} aria-label={t('workbench')}>
      <button type="button" onClick={props.openProjects}>{t('projects')}</button>
      <button type="button" onClick={openFiles}>{t('files')}</button>
      <button type="button" disabled={terminal.phase === 'opening'} onClick={() => setTerminal({ phase: 'opening' })}>{t('terminal')}</button>
      <button type="button" disabled={!changes} onClick={() => {
        if (changes && changedTurn !== undefined) openDiff(sessionId, changes.seq, changedTurn)
      }}>{t('diff')}</button>
      <button type="button" onClick={openSettings}>{t('settings')}</button>
      {terminal.phase === 'error' && <span role="status">{terminal.message}</span>}
    </nav>
    <nav className={css.toolbar} aria-label={t('projectActions')}><button type="button" onClick={props.openAuxiliary}>{t('auxiliary')}</button></nav>
    </div>
    </div>
  )
}

/** 监控只组合原生投影与已装配工具事件，不触发模型调用。 */
export function Monitor(props: PropsRuntime<'conversation.view'> & PropsLocale<'forge'>) {
  const { t, useConversation } = props
  const facts = useForgeFacts(props)
  const events = useConversation(value => value.views.get('chat')?.legacy.nodes.filter(node => node.kind === 'tool-result' || node.kind === 'turn-error').slice(-12) ?? [])
  return <section className={css.monitor} aria-label={t('monitor')}>
    <header className={css.monitorHeading}><div><span className={css.eyebrow}>{t('liveSession')}</span><h2>{t('monitor')}</h2></div><span className={css.status} data-tone={facts.tone}>{facts.status}</span></header>
    <div className={css.metricGrid}><div><span>{t('turns')}</span><strong>{facts.stats?.turns ?? '—'}</strong></div><div><span>{t('steps')}</span><strong>{facts.stats?.steps ?? '—'}</strong></div><div><span>{t('input')}</span><strong>{facts.inputTokens?.toLocaleString() ?? '—'}</strong></div><div><span>{t('output')}</span><strong>{facts.usage?.outputTokens.toLocaleString() ?? '—'}</strong></div></div>
    <div className={css.activeReadout}><span>{t('activity')}</span><strong>{facts.activity}</strong></div>
    <h3>{t('recentEvents')}</h3>
    <ol className={css.timeline}>{events.map(event => <li key={event.seq} data-tone={event.kind === 'turn-error' || event.isError ? 'error' : 'settled'}><time>{new Date(event.time).toLocaleTimeString()}</time><strong>{event.kind === 'turn-error' ? event.message : event.name}</strong><span>{event.kind === 'turn-error' || event.isError ? t('toolFailed') : t('toolReturned')}</span></li>)}</ol>
    {events.length === 0 && <p className={css.hint}>{t('noLogs')}</p>}
  </section>
}

type LogProps = PropsRuntime<'conversation.view'> & PropsLocale<'forge'>

/** 日志直接读取当前会话已装配的工具结果；原始详情仍由原生检查器展示。 */
export function ExecutionLog({ useConversation, inspectCall, t }: LogProps) {
  const [query, setQuery] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const chat = useConversation(value => value.views.get('chat'))
  const entries = chat?.legacy.nodes.filter(node => node.kind === 'tool-result' || node.kind === 'turn-error') ?? []
  const search = query.trim().toLocaleLowerCase()
  const visible = entries.filter(entry => {
    if (errorsOnly && entry.kind !== 'turn-error' && !entry.isError) return false
    const text = entry.kind === 'turn-error' ? `${entry.message} ${entry.code}`
      : `${entry.name} ${entry.call?.argsRaw ?? ''} ${entry.content.filter(block => block.type === 'text').map(block => block.text).join('\n')}`
    return !search || text.toLocaleLowerCase().includes(search)
  })
  return (
    <section className={css.log} aria-label={t('logs')}>
      <h2>{t('logs')}</h2>
      <div className={css.toolbar}>
        <input type="search" aria-label={t('searchLogs')} placeholder={t('searchLogs')} value={query} onChange={event => setQuery(event.target.value)} />
        <label><input type="checkbox" checked={errorsOnly} onChange={event => setErrorsOnly(event.target.checked)} />{t('errorsOnly')}</label>
      </div>
      {chat?.legacy.runningCalls.map(call => (
        <p key={call.callId} role="status">{t('running')} · {call.name}</p>
      ))}
      {entries.length === 0 && <p>{t('noLogs')}</p>}
      {entries.length > 0 && visible.length === 0 && <p>{t('noMatches')}</p>}
      {visible.map(entry => entry.kind === 'turn-error' ? (
        <p key={entry.seq} className={css.error} role="status">{entry.message || entry.code || t('error')}</p>
      ) : (
        <details key={entry.seq} className={css.logEntry} open={entry.isError || undefined}>
          <summary>
            <time>{new Date(entry.time).toLocaleTimeString()}</time>
            <strong>{entry.name}</strong>
            <span>{entry.error?.code === 'ABORTED' || entry.error?.code === 'ABORTED_BEFORE_DISPATCH'
              ? t('stopped') : entry.isError ? t('toolFailed') : t('toolReturned')}</span>
          </summary>
          {entry.call && <pre>{entry.call.argsRaw}</pre>}
          {entry.content.map((block, index) => block.type === 'text' ? <pre key={index}>{block.text}</pre> : null)}
          {inspectCall && <button type="button" onClick={() => inspectCall(entry.callId)}>{t('details')}</button>}
        </details>
      ))}
    </section>
  )
}
