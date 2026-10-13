import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

export type AuxiliarySessionId = PropsRuntime<'conversation.view'>['sessionId']
export type AuxiliaryKind = 'workspace' | 'memory'

/** 独立会话标识同时保存来源关联；执行记录沿用原生持久化。 */
export function auxiliaryPrefix(source: AuxiliarySessionId): string {
  return `forge-aux-${source}--`
}

/** 只在点击提交时截取已结束的文字，不复制工具指令或推理过程。 */
export function memoryReference(nodes: readonly ConversationNode[]): string {
  return nodes.filter(node => node.kind === 'user' || (node.kind === 'assistant' && !node.interrupted))
    .slice(-8).map(node => node.kind === 'user'
      ? `User: ${node.content.filter(block => block.type === 'text').map(block => block.text).join('\n')}`
      : node.kind === 'assistant' ? `Assistant: ${node.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n')}` : '')
    .join('\n\n').slice(-24000)
}

export interface AuxiliarySubmission {
  taskId: AuxiliarySessionId
  cwd: string
  title: string
  text: string
}

export interface AuxiliaryTransport {
  create: (id: AuxiliarySessionId, cwd: string) => Promise<void>
  rename: (id: AuxiliarySessionId, title: string) => Promise<void>
  prompt: (id: AuxiliarySessionId, text: string) => Promise<void>
}

/** 每次任务使用新会话，提交路径不接收主会话作为消息目的地。 */
export async function submitAuxiliaryTask(transport: AuxiliaryTransport, task: AuxiliarySubmission): Promise<void> {
  await transport.create(task.taskId, task.cwd)
  await transport.rename(task.taskId, task.title)
  await transport.prompt(task.taskId, task.text)
}
