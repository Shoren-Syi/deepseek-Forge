/** 在原生工作台插槽中添加 Forge 标识和轻量检查器。 */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-terminal-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-terminal/src/client/face.ts'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ForgeControlValues } from '@deepseek-ai/dsh-forge/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Inspector, InspectorPanel } from './Inspector.tsx'
import { FooterHost, Footer, FixedInspectorHost, ToolsPlaceholderHost, ToolsPlaceholder, Monitor, ExecutionLog, type WorkbenchActions } from './Workbench.tsx'
import type { ControlActions, ControlDocument } from './Controls.tsx'
import { zh, en, type ForgeKey } from './locale.ts'
import { AuxiliaryPanel, AuxiliaryResult, type AuxiliaryActions } from './Auxiliary.tsx'
import { submitAuxiliaryTask } from './auxiliary-task.ts'
import { PixelWhale, WhaleHero } from './Whale.tsx'
import css from './forge.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 底部工具区使用当前会话的原生绑定。 */
    'forge.workbench.footer': { kind: 'single'; scope: 'session' }
    /** 结果区域只绑定辅助任务自己的会话。 */
    'forge.auxiliary.result': { kind: 'single'; scope: 'session' }
    /** 固定检查器始终使用主会话。 */
    'forge.inspector.fixed': { kind: 'single'; scope: 'session' }
    /** 工具区空状态及原生操作入口。 */
    'forge.tools.placeholder': { kind: 'single'; scope: 'session' }
  }
  interface LocaleNamespaceMap {
    /** Forge 的标识、状态和用量文字。 */
    forge: ForgeKey
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** 辅助任务面板独立持有的读取引用。 */
    forgeAuxiliary: unknown
  }
}

export const inject = ['slots', 'locale', 'sessions', 'layout', 'shortcuts', 'sidebarRight', 'sidebarRightTabs', 'webTerminals', 'remote', 'remote.settings', 'remote.session']

function Brand({ t }: PropsRuntime<'sidebar.brand.name'> & PropsLocale<'forge'>) {
  return createElement('span', { className: css.brand }, t('brand'))
}

function Mark({ size }: PropsRuntime<'sidebar.brand.mark'>) {
  return createElement(PixelWhale, { size: Math.max(size, 28) })
}

function ControlButton({ open, t }: PropsRuntime<'conversation.input.left'> & PropsLocale<'forge'> & InjectFace<{ open: () => void }>) {
  return createElement('button', { type: 'button', className: css.controlButton, onClick: open }, t('taskControls'))
}

/**
 * 插槽贡献随所属界面与插件的生命周期清理。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: Context): void {
  const focusInspector = () => document.querySelector<HTMLElement>('[data-forge-fixed-inspector]')?.focus()
  const openTaskSettings = () => {
    const details = document.querySelector<HTMLDetailsElement>('[data-forge-fixed-inspector] [data-forge-task-settings]')
    if (details) { details.open = true; details.scrollIntoView({ block: 'nearest' }) }
    focusInspector()
  }
  ctx.effect(() => {
    document.body.setAttribute('data-forge-workbench', '')
    return () => document.body.removeAttribute('data-forge-workbench')
  }, 'forge.workbench.appearance')
  ctx.inject(['shortcuts'], scope => {
    scope.effect(() => scope.shortcuts.register({
      id: 'forge.controls' as ShortcutCommandId, label: () => ctx.locale.bind('forge')('taskControls'), aliases: ['forge', 'budget', 'inspector'],
      defaults: {
        'desktop:windows': { code: 'KeyI', modifiers: ['control', 'alt'] },
        'web:windows': { code: 'KeyI', modifiers: ['control', 'alt'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: ({ target: element }) => {
        const target = scope.sidebarRight.commandTarget(element)
        if (target === undefined) return { status: 'blocked', reason: ctx.locale.bind('forge')('noSession') }
        return { status: 'handled', run: openTaskSettings }
      },
    }), 'forge.controls.shortcut')
    scope.effect(() => scope.shortcuts.register({
      id: 'forge.auxiliary' as ShortcutCommandId, label: () => ctx.locale.bind('forge')('auxiliary'), aliases: ['auxiliary', 'summary', 'memory'],
      defaults: {
        'desktop:windows': { code: 'KeyA', modifiers: ['control', 'alt', 'shift'] },
        'web:windows': { code: 'KeyA', modifiers: ['control', 'alt', 'shift'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: ({ target: element }) => {
        const target = scope.sidebarRight.commandTarget(element)
        if (target === undefined) return { status: 'blocked', reason: ctx.locale.bind('forge')('noSession') }
        return { status: 'handled', run: () => scope.sidebarRight.openTabFromTarget('forge-auxiliary', target) }
      },
    }), 'forge.auxiliary.shortcut')
  })
  const controlActions = (): ControlActions => ({
    readControls: async (): Promise<ControlDocument> => {
      const [settings, catalog] = await Promise.all([ctx.remote.settings.describe(), ctx.remote.session.modelCatalog()])
      if (!settings.ok) throw new Error(settings.error.message)
      if (!catalog.ok) throw new Error(catalog.error.message)
      const document = settings.value.namespaces.find(value => value.ns === 'forge-controls')
      if (!document) throw new Error(ctx.locale.bind('forge')('controlsMissing'))
      // 控制值已由原生设置 Schema 校验，读取时不重新定义一套配置规则。
      const values = document.value as unknown as ForgeControlValues
      if (!values) throw new Error(ctx.locale.bind('forge')('controlsMissing'))
      return { values, revision: document.revision, catalog: catalog.value }
    },
    saveControls: async (sessionId, policy, values, revision) => {
      const result = await ctx.remote.settings.mutate('forge-controls', [
        { op: 'set', path: ['policies', sessionId], value: JSON.parse(JSON.stringify(policy)) as JsonValue },
        { op: 'set', path: ['routes'], value: JSON.parse(JSON.stringify(values.routes)) as JsonValue },
        { op: 'set', path: ['prices'], value: JSON.parse(JSON.stringify(values.prices)) as JsonValue },
      ], revision)
      if (!result.ok) throw new Error(result.error.message)
    },
  })
  ctx.effect(() => ctx.locale.register('forge', { zh, en }), 'forge.locale')
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name', locale: 'forge', priority: -10,
  }, Brand))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark', priority: -10,
  }, Mark))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -10, locale: 'forge',
    inject: () => ({ openFiles: () => ctx.sidebarRight.openTab('files'), openAuxiliary: () => ctx.sidebarRight.openTab('forge-auxiliary') }),
  }, WhaleHero))
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: 'forge-inspector', kind: 'forge-inspector', priority: 'builtin', title: () => ctx.locale.bind('forge')('inspector'),
  }), 'forge.inspector.tab')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: 'forge-inspector', locale: 'forge', inject: controlActions,
  }, InspectorPanel))
  const auxiliaryActions: AuxiliaryActions = {
    retain: id => ctx.sessions.retain(id, { source: 'forgeAuxiliary' }),
    submit: task => submitAuxiliaryTask({
      create: async (sessionId, cwd) => { await ctx.sessions.create({ sessionId, cwd }) },
      rename: async (sessionId, title) => {
        const result = await ctx.remote.session.rename({ sessionId, title })
        if (!result.ok) throw new Error(result.error.message)
      },
      prompt: async (sessionId, text) => {
        const result = await ctx.remote.session.prompt({ sessionId, requestId: crypto.randomUUID() as SessionRequestId, mode: 'queue', content: [{ type: 'text', text }] })
        if (!result.ok) throw new Error(result.error.message)
      },
    }, task),
    cancel: async sessionId => {
      const result = await ctx.remote.session.cancel({ sessionId })
      if (!result.ok) throw new Error(result.error.message)
    },
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: 'forge-auxiliary', kind: 'forge-auxiliary', priority: 'builtin', title: () => ctx.locale.bind('forge')('auxiliary'),
  }), 'forge.auxiliary.tab')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: 'forge-auxiliary', locale: 'forge', inject: () => auxiliaryActions,
    children: { 'forge.auxiliary.result': { kind: 'single', scope: 'session' } },
  }, AuxiliaryPanel))
  ctx.slots.inject('forge.auxiliary.result', () => ctx.slots.register({
    name: 'forge.auxiliary.result', locale: 'forge', inject: () => ({ cancel: auxiliaryActions.cancel }),
  }, AuxiliaryResult))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'forge-controls', locale: 'forge',
    inject: () => ({ open: openTaskSettings }),
  }, ControlButton))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'forge-inspector', order: 10, locale: 'forge',
  }, Inspector))
  const workbenchActions = (): WorkbenchActions => ({
      openProjects: () => ctx.layout.toggleSidebar(),
      openFiles: () => ctx.sidebarRight.openTab('files', { preferNewPane: true }),
      openSettings: () => ctx.shortcuts.invoke('settings.open' as ShortcutCommandId, { source: 'menu', region: 'page', modal: null, target: document.activeElement }),
      openAuxiliary: () => ctx.sidebarRight.openTab('forge-auxiliary', { preferNewPane: true }),
      openTerminal: async (sessionId, signal) => {
        const choices = await ctx.webTerminals.launchShells(sessionId, signal)
        const pwsh = choices.shells.find(shell => /(?:^|[\\/])pwsh(?:\.exe)?$/i.test(shell.path))
        if (!pwsh) throw new Error(ctx.locale.bind('forge')('missingPwsh'))
        signal.throwIfAborted()
        ctx.sidebarRight.openTabIn(sessionId, 'terminal', { params: { shellPath: pwsh.path }, preferNewPane: true })
      },
      openDiff: (sessionId, seq, turn) => {
        ctx.sidebarRight.openResourceIn(sessionId, `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/${seq}/${turn}`, { preferNewPane: true })
      },
    })
  ctx.slots.inject('shell.bottom', () => ctx.slots.register({
    name: 'shell.bottom', children: { 'forge.workbench.footer': { kind: 'single', scope: 'session' } },
  }, FooterHost))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'forge-fixed-inspector', children: { 'forge.inspector.fixed': { kind: 'single', scope: 'session' } },
  }, FixedInspectorHost))
  ctx.slots.inject('forge.inspector.fixed', () => ctx.slots.register({
    name: 'forge.inspector.fixed', locale: 'forge', inject: controlActions,
  }, InspectorPanel))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'forge-tools-placeholder', children: { 'forge.tools.placeholder': { kind: 'single', scope: 'session' } },
  }, ToolsPlaceholderHost))
  ctx.slots.inject('forge.tools.placeholder', () => ctx.slots.register({
    name: 'forge.tools.placeholder', locale: 'forge', inject: workbenchActions,
  }, ToolsPlaceholder))
  ctx.slots.inject('forge.workbench.footer', () => ctx.slots.register({
    name: 'forge.workbench.footer', locale: 'forge', inject: workbenchActions,
  }, Footer))
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'forge-monitor', order: 30, locale: 'forge', label: () => ctx.locale.bind('forge')('monitor'),
  }, Monitor))
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'forge-execution', order: 20, locale: 'forge', label: () => ctx.locale.bind('forge')('logs'),
  }, ExecutionLog))
}
