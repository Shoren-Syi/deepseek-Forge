import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuxiliaryResult } from '../src/client/Auxiliary.tsx'
import { zh } from '../src/client/locale.ts'

function fixture(pending = false) {
  const sessionId = 'forge-aux-session-main--workspace-test'
  const factory = vi.fn((_name: string, _input: object, _options: { slots: { views: () => null } }) => createElement('div', null, '等待用户确认'))
  const props = {
    sessionId,
    t: (key: keyof typeof zh) => zh[key],
    useSession: (select: (value: object) => unknown) => select({ running: false, blank: false }),
    useSessions: (select: (value: object) => unknown) => select({ byId: { [sessionId]: { cwd: 'D:/example' } } }),
    useSessionStatus: (select: (value: Map<string, object>) => unknown) => select(new Map(pending ? [[sessionId, { pendingInteraction: { key: 'approval-1', kind: 'approval' } }]] : [])),
    useProjection: () => undefined,
    useConversation: (select: (value: object) => unknown) => select({ views: new Map([['chat', {
      legacy: { runningCalls: [], nodes: [
        { kind: 'user', content: [{ type: 'text', text: '内部任务指令' }] },
        { kind: 'assistant', blocks: [{ kind: 'reasoning', text: '内部推理' }, { kind: 'text', text: '摘要已保存。' }] },
      ] },
      timeline: { turnOrder: [], turns: new Map() },
    }]]) }),
    renderFactorySlot: factory,
    cancel: vi.fn(),
  } as Parameters<typeof AuxiliaryResult>[0]
  return { props, factory }
}

describe('辅助任务结果区域', () => {
  it('展示结果和提交状态，不展示内部请求与推理', () => {
    const { props, factory } = fixture()
    const html = renderToStaticMarkup(createElement(AuxiliaryResult, props))
    expect(html).toContain('摘要已保存。')
    expect(html).toContain('任务已提交，与当前对话独立。')
    expect(html).not.toContain('内部任务指令')
    expect(html).not.toContain('内部推理')
    expect(factory).not.toHaveBeenCalled()
  })

  it('需要确认时接入原生交互入口，但不装配会话消息区', () => {
    const { props, factory } = fixture(true)
    const html = renderToStaticMarkup(createElement(AuxiliaryResult, props))
    expect(html).toContain('等待用户确认')
    expect(factory).toHaveBeenCalledTimes(1)
    const options = factory.mock.calls[0]![2]
    expect(options.slots.views()).toBeNull()
    expect(html).not.toContain('内部任务指令')
  })
})
