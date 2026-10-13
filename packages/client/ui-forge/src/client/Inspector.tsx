import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import css from './forge.module.css'
import { Controls, type ControlActions } from './Controls.tsx'

type InspectorProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'forge'>
type SessionInputs = Pick<InspectorProps, 'sessionId' | 'useSession' | 'useSessions' | 'useSessionStatus' | 'useConversation' | 'useProjection' | 't'>

/** 检查器只读取原生快照和投影，不保存第二份任务或用量状态。 */
export function useForgeFacts({ sessionId, useSession, useSessions, useSessionStatus, useConversation, useProjection, t }: SessionInputs) {
  const running = useSession(value => value.running)
  const blank = useSession(value => value.blank)
  const pending = useSessionStatus(value => value.get(sessionId)?.pendingInteraction)
  const reason = useConversation(value => {
    const chat = value.views.get('chat')
    const turnId = chat?.timeline.turnOrder.at(-1)
    return turnId === undefined ? undefined : chat?.timeline.turns.get(turnId)?.end?.data.reason.kind
  })
  const activeTool = useConversation(value => value.views.get('chat')?.legacy.runningCalls.at(-1)?.name)
  const cwd = useSessions(value => value.byId[sessionId]?.cwd)
  const selection = useProjection('modelSelection')
  const model = selection?.next ?? selection?.lastUsed
  const usage = useProjection('tokenUsage')
  const stats = useProjection('sessionStats')
  const error = useSession(value => value.promptError?.error.message ?? value.lastAgentError ?? value.openError?.message)
  const status = pending ? t('waiting') : running ? t('running') : error ? t('error')
    : reason === 'aborted' ? t('stopped') : reason === 'blocked' ? t('blocked') : blank ? t('ready') : t('ended')
  const activity = pending ? t('waiting') : activeTool ?? (running ? t('responding') : status)
  const inputTokens = usage === undefined ? undefined : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const tone = error ? 'error' : pending || reason === 'blocked' ? 'warning' : running ? 'active' : blank ? 'idle' : 'settled'
  return { session: { running }, model, cwd, usage, stats, error, status, activity, inputTokens, tone }
}

function Readings({ facts, t }: { facts: ReturnType<typeof useForgeFacts>; t: InspectorProps['t'] }) {
  const { model, cwd, usage, stats, error, inputTokens } = facts
  const number = (value: number | undefined) => value === undefined ? t('unknown') : value.toLocaleString()
  return <>
    <dl className={css.readings}>
      <dt>{t('model')}</dt><dd>{model ? `${model.provider} / ${model.model}` : t('unknown')}</dd>
      <dt>{t('workspace')}</dt><dd title={cwd}>{cwd ?? t('unknown')}</dd>
      <dt>{t('turns')}</dt><dd>{number(stats?.turns)}</dd>
      <dt>{t('steps')}</dt><dd>{number(stats?.steps)}</dd>
      <dt>{t('input')}</dt><dd>{number(inputTokens)}</dd>
      <dt>{t('output')}</dt><dd>{number(usage?.outputTokens)}</dd>
      <dt>{t('cache')}</dt><dd>{number(usage?.cacheReadTokens)}</dd>
      <dt>{t('uncached')}</dt><dd>{number(usage?.uncachedInputTokens)}</dd>
      <dt>{t('cacheWrite')}</dt><dd>{number(usage?.cacheWriteTokens)}</dd>
      <dt>{t('modelTime')}</dt><dd>{stats ? `${(stats.llmMs / 1000).toFixed(1)} s` : t('unknown')}</dd>
      <dt>{t('toolTime')}</dt><dd>{stats ? `${(stats.toolMs / 1000).toFixed(1)} s` : t('unknown')}</dd>
    </dl>
    {error && <p className={css.error} role="status">{error}</p>}
  </>
}

export function Inspector(props: InspectorProps) {
  const facts = useForgeFacts(props)
  const { session, error, status } = facts
  const { t } = props

  return (
    <details className={css.inspector} data-forge-inspector>
      <summary title={t('inspector')} className={css.summary} data-tone={facts.tone}>
        <span className={css.dot} data-running={session.running} data-error={!session.running && Boolean(error)} />
        <span>{status}</span>
      </summary>
      <div className={css.panel}>
        <strong>{t('inspector')}</strong>
        <Readings facts={facts} t={t} />
      </div>
    </details>
  )
}

/** 常驻面板和顶部弹层共用原生事实，布局偏好由原生侧栏保存。 */
export function InspectorPanel(props: SessionInputs & InjectFace<ControlActions>) {
  const facts = useForgeFacts(props)
  return <section className={css.inspectorBody} aria-label={props.t('inspector')}>
    <header className={css.inspectorHeading}><h2>{props.t('inspector')}</h2><span className={css.status} data-tone={facts.tone}>{facts.status}</span></header>
    <div className={css.activeReadout}><span>{props.t('activity')}</span><strong>{facts.activity}</strong></div>
    <div className={css.metricGrid}>
      <div><span>{props.t('steps')}</span><strong>{facts.stats?.steps ?? '—'}</strong></div>
      <div><span>{props.t('totalTokens')}</span><strong>{facts.inputTokens === undefined ? '—' : (facts.inputTokens + (facts.usage?.outputTokens ?? 0)).toLocaleString()}</strong></div>
      <div><span>{props.t('cacheRate')}</span><strong>{facts.inputTokens ? `${Math.round((facts.usage?.cacheReadTokens ?? 0) / facts.inputTokens * 100)}%` : '—'}</strong></div>
      <div><span>{props.t('modelTime')}</span><strong>{facts.stats ? `${(facts.stats.llmMs / 1000).toFixed(1)} s` : '—'}</strong></div>
    </div>
    <dl className={css.identity}><dt>{props.t('model')}</dt><dd>{facts.model?.model ?? props.t('unknown')}</dd><dt>{props.t('workspace')}</dt><dd title={facts.cwd}>{facts.cwd?.split(/[\\/]/).at(-1) ?? props.t('unknown')}</dd></dl>
    {facts.error && <p className={css.error} role="status">{facts.error}</p>}
    <details className={css.disclosure}><summary>{props.t('usageDetails')}</summary><Readings facts={facts} t={props.t} /></details>
    <Controls {...props} />
  </section>
}
