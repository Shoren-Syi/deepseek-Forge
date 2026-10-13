import { describe, expect, it, vi } from 'vitest'
import { auxiliaryPrefix, memoryReference, submitAuxiliaryTask, type AuxiliarySessionId } from '../src/client/auxiliary-task.ts'

const source = 'session-main' as AuxiliarySessionId
const taskId = `${auxiliaryPrefix(source)}workspace-test` as AuxiliarySessionId
const task = { taskId, cwd: 'D:/example', title: '工作区摘要', text: '生成摘要' }

describe('独立辅助任务', () => {
  it('创建独立会话后只向该会话提交，不向来源会话发送消息', async () => {
    const transport = { create: vi.fn().mockResolvedValue(undefined), rename: vi.fn().mockResolvedValue(undefined), prompt: vi.fn().mockResolvedValue(undefined) }
    await submitAuxiliaryTask(transport, task)
    expect(transport.create).toHaveBeenCalledWith(taskId, 'D:/example')
    expect(transport.rename).toHaveBeenCalledWith(taskId, '工作区摘要')
    expect(transport.prompt).toHaveBeenCalledExactlyOnceWith(taskId, '生成摘要')
    expect(transport.prompt.mock.calls.some(([id]) => id === source)).toBe(false)
  })

  it.each(['create', 'rename'] as const)('%s 失败时保留错误，不提交任务', async stage => {
    const transport = { create: vi.fn().mockResolvedValue(undefined), rename: vi.fn().mockResolvedValue(undefined), prompt: vi.fn().mockResolvedValue(undefined) }
    transport[stage].mockRejectedValue(new Error('服务不可用'))
    await expect(submitAuxiliaryTask(transport, task)).rejects.toThrow('服务不可用')
    expect(transport.prompt).not.toHaveBeenCalled()
  })

  it('提交失败不伪造成功或自动重发', async () => {
    const transport = { create: vi.fn().mockResolvedValue(undefined), rename: vi.fn().mockResolvedValue(undefined), prompt: vi.fn().mockRejectedValue(new Error('提交失败')) }
    await expect(submitAuxiliaryTask(transport, task)).rejects.toThrow('提交失败')
    expect(transport.prompt).toHaveBeenCalledTimes(1)
  })

  it('经验参考只取对话文字，排除思考和工具参数', () => {
    expect(memoryReference([
      { kind: 'user', seq: 1, time: 1, source: null, content: [{ type: 'text', text: '保留现有 API' }] },
      { kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: '隐藏推理' }, { kind: 'tool-call', callId: 'c1', name: 'pwsh', argsRaw: '隐藏参数' }, { kind: 'text', text: 'API 已保留' }] },
    ])).toBe('User: 保留现有 API\n\nAssistant: API 已保留')
  })
})
