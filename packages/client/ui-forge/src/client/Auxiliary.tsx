import { useEffect, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import { auxiliaryPrefix, memoryReference, type AuxiliaryKind, type AuxiliarySessionId, type AuxiliarySubmission } from './auxiliary-task.ts'
import { useForgeFacts } from './Inspector.tsx'
import css from './forge.module.css'

export interface AuxiliaryActions {
  submit: (task: AuxiliarySubmission) => Promise<void>
  retain: (id: AuxiliarySessionId) => SessionReference
  cancel: (id: AuxiliarySessionId) => Promise<void>
}

type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'forge'> & InjectFace<AuxiliaryActions> & PropsRenderSlots<'forge.auxiliary.result'>

/** 主会话仅提供工作目录和提交时的参考资料，执行与结果绑定独立会话。 */
export function AuxiliaryPanel({ sessionId, useSessions, useConversation, submit, retain, renderSlot, SessionProvider, t }: PanelProps) {
  const catalog = useSessions(value => value)
  const conversation = useConversation(value => value.views.get('chat'))
  const tasks = Object.values(catalog.byId).filter(task => task.id.startsWith(auxiliaryPrefix(sessionId))).sort((a, b) => b.updatedAt - a.updatedAt)
  const [selected, setSelected] = useState<AuxiliarySessionId>()
  const [reference, setReference] = useState<SessionReference>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const target = selected ?? tasks[0]?.id
  const cwd = catalog.byId[sessionId]?.cwd

  useEffect(() => {
    setReference(undefined)
    if (!target) return
    const acquired = retain(target)
    let active = true
    setReference(acquired)
    void acquired.ready.catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : String(failure))
    })
    return () => { active = false; acquired.release() }
  }, [target, retain])

  async function start(kind: AuxiliaryKind) {
    if (!cwd) return
    setSubmitting(true)
    setError('')
    const taskId = `${auxiliaryPrefix(sessionId)}${kind}-${crypto.randomUUID()}` as AuxiliarySessionId
    const title = t(kind === 'workspace' ? 'workspaceSummary' : 'projectMemory')
    const context = kind === 'memory' ? memoryReference(conversation?.legacy.nodes ?? []) : ''
    const text = `${t(kind === 'workspace' ? 'workspacePrompt' : 'memoryPrompt')}\n\n${t('auxiliaryInstruction')}${context ? `\n\n${t('referenceLabel')}\n${context}` : ''}`
    try {
      await submit({ taskId, cwd, title, text })
      setSelected(taskId)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return <section className={css.inspectorBody} aria-label={t('auxiliary')}>
    <header className={css.inspectorHeading}><h2>{t('auxiliary')}</h2></header>
    <p className={css.hint}>{t('auxiliaryHelp')}</p>
    <div className={css.toolbar}>{(['workspace', 'memory'] as const).map(kind => <button key={kind} type="button" disabled={!cwd || submitting || tasks.some(task => task.running)} onClick={() => { void start(kind) }}>{t(kind === 'workspace' ? 'workspaceSummary' : 'projectMemory')}</button>)}</div>
    {submitting && <p role="status">{t('submittingTask')}</p>}
    {error && <p role="alert" className={css.error}>{error}</p>}
    {!cwd && <p role="status">{t('noWorkspace')}</p>}
    {tasks.length > 0 && <nav className={css.auxiliaryHistory} aria-label={t('auxiliaryHistory')}>{tasks.map(task => <button type="button" key={task.id} aria-pressed={task.id === target} onClick={() => setSelected(task.id)}><span>{task.title ?? t('auxiliary')}</span><time>{new Date(task.updatedAt).toLocaleString()}</time></button>)}</nav>}
    {reference && reference.sessionId === target && <SessionProvider session={reference}>{renderSlot('forge.auxiliary.result', {})}</SessionProvider>}
    {tasks.length === 0 && !submitting && <p className={css.hint}>{t('noAuxiliaryTasks')}</p>}
  </section>
}

/** 仅展示结果正文和状态，不渲染内部请求、思考过程或工具参数。 */
export function AuxiliaryResult(props: PropsRuntime<'forge.auxiliary.result'> & PropsLocale<'forge'> & PropsRenderFactories & InjectFace<Pick<AuxiliaryActions, 'cancel'>>) {
  const { t, sessionId, useConversation, cancel } = props
  const facts = useForgeFacts(props)
  const pending = props.useSessionStatus(value => value.get(sessionId)?.pendingInteraction)
  const result = useConversation(value => {
    const nodes = value.views.get('chat')?.legacy.nodes ?? []
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]
      if (node?.kind === 'assistant' && !node.blocks.some(block => block.kind === 'tool-call')) {
        return node.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n')
      }
    }
    return ''
  })
  const blank = props.useSession(value => value.blank)
  const [cancelError, setCancelError] = useState('')
  return <div className={css.auxiliaryResult}>
    <div className={css.inspectorHeading}><strong>{t('executionResult')}</strong><span role="status" className={css.status} data-tone={facts.tone}>{blank ? t('notSubmitted') : facts.session.running ? t('running') : facts.status}</span></div>
    {!blank && <p className={css.hint}>{t('taskSubmitted')}</p>}
    {facts.error && <p role="alert" className={css.error}>{facts.error}</p>}
    {facts.session.running && <button type="button" onClick={() => { void cancel(sessionId).catch((failure: unknown) => setCancelError(String(failure))) }}>{t('stopAuxiliary')}</button>}
    {cancelError && <p role="alert" className={css.error}>{cancelError}</p>}
    {pending && props.renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: { views: NoTaskTranscript } })}
    {result && <div className={css.auxiliaryText}><MarkdownText text={result} labels={{ code: { copyLabel: t('copyResult'), copiedLabel: t('copiedResult') }, footnotes: t('footnotes') }} /></div>}
    {!result && !facts.error && <p className={css.hint}>{t('awaitingResult')}</p>}
  </div>
}

/** 借用原生问题与权限处理入口时，仍不展示辅助会话的内部消息。 */
function NoTaskTranscript() { return null }
