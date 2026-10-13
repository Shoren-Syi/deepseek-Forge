import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeControlValues, ForgeRoute, ForgeTaskPolicy } from '@deepseek-ai/dsh-forge/types'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import css from './forge.module.css'

/** 当前原生配置及其写入修订号、可选模型目录。 */
export interface ControlDocument {
  values: ForgeControlValues
  revision: number
  catalog: ModelCatalog
}

/** 配置读写通过原生接口，组件只维护编辑草稿。 */
export interface ControlActions {
  readControls: () => Promise<ControlDocument>
  saveControls: (sessionId: string, policy: ForgeTaskPolicy, values: ForgeControlValues, revision: number) => Promise<void>
}

type ControlProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'sessionId' | 'useProjection'> & PropsLocale<'forge'> & InjectFace<ControlActions>

/** 编辑草稿属于当前面板，保存后由原生设置成为唯一配置来源。 */
export function Controls({ sessionId, useProjection, readControls, saveControls, t }: ControlProps) {
  const economy = useProjection('forgeEconomy')
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const [document, setDocument] = useState<ControlDocument>()
  const [policy, setPolicy] = useState<ForgeTaskPolicy>({ mode: 'manual', maxSteps: 0, tokenBudget: 0, estimatedCostBudget: 0, currency: 'CNY' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const valid = Number.isSafeInteger(policy.maxSteps) && policy.maxSteps >= 0 && Number.isSafeInteger(policy.tokenBudget) && policy.tokenBudget >= 0
    && Number.isFinite(policy.estimatedCostBudget) && policy.estimatedCostBudget >= 0
    && (document?.values.prices.every(price => [price.input, price.output, price.cacheRead, price.cacheWrite].every(value => Number.isFinite(value) && value >= 0) && price.source.trim().length > 0) ?? true)
  useEffect(() => {
    let active = true
    void readControls().then(value => {
      if (!active) return
      setDocument(value)
      setPolicy(value.values.policies[sessionId] ?? { mode: 'manual', maxSteps: 0, tokenBudget: 0, estimatedCostBudget: 0, currency: 'CNY' })
      setError('')
      setSaved(false)
    }, (reason: unknown) => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [sessionId, readControls])
  const choices = document?.catalog.groups.flatMap(group => group.models.map(model => ({
    key: JSON.stringify([group.id, model.id]), label: `${group.name} / ${model.name}`, route: { provider: group.id, model: model.id }, efforts: model.reasoning?.efforts ?? [],
  }))) ?? []
  const routeKey = (route: ForgeRoute | null | undefined) => route ? JSON.stringify([route.provider, route.model]) : ''
  const updateRoute = (role: 'fast' | 'deep', key: string) => {
    if (!document) return
    const routes = { ...document.values.routes }
    const selected = choices.find(choice => choice.key === key)?.route
    if (selected) routes[role] = selected
    else delete routes[role]
    setDocument({ ...document, values: { ...document.values, routes } })
    setSaved(false)
  }
  const editPrice = (index: number, key: 'input' | 'output' | 'cacheRead' | 'cacheWrite', value: string) => {
    if (!document) return
    const prices = document.values.prices.map((price, position) => position === index ? { ...price, [key]: Number(value) } : price)
    setDocument({ ...document, values: { ...document.values, prices } })
    setSaved(false)
  }
  const priced = economy?.models.map(row => {
    const price = document?.values.prices.find(value => value.provider === row.provider && value.model === row.model)
    return { row, price, amount: price ? (row.input * price.input + row.output * price.output + row.cacheRead * price.cacheRead + row.cacheWrite * price.cacheWrite) / 1_000_000 : undefined }
  }) ?? []
  return <section className={css.controls}>
    <h3>{t('budgetOverview')}</h3>
    <div className={css.budgetRow}><span>{t('steps')}</span><strong>{stats?.steps ?? 0} / {policy.maxSteps || t('unlimited')}</strong></div>
    {policy.maxSteps > 0 && <progress aria-label={t('stepBudget')} value={stats?.steps ?? 0} max={policy.maxSteps} />}
    <div className={css.budgetRow}><span>{t('tokenBudget')}</span><strong>{usage ? (usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens).toLocaleString() : '—'} / {policy.tokenBudget ? policy.tokenBudget.toLocaleString() : t('unlimited')}</strong></div>
    <div className={css.budgetRow}><span>{t('estimatedCost')}</span><strong>{priced.length && priced.every(value => value.price?.currency === policy.currency && value.amount !== undefined) ? `${policy.currency} ${priced.reduce((sum, value) => sum + value.amount!, 0).toFixed(4)}` : t('unknownPrice')}</strong></div>
    <details className={css.disclosure} data-forge-task-settings><summary>{t('taskControls')}</summary>
    <p className={css.hint}>{t('budgetHelp')}</p>
    {error && <p role="status" className={css.error}>{error}</p>}
    {document && <>
      <label>{t('routeMode')}<select value={policy.mode} onChange={event => { setPolicy({ ...policy, mode: event.target.value as ForgeTaskPolicy['mode'] }); setSaved(false) }}>
        <option value="manual">{t('manualRoute')}</option><option value="rules">{t('ruleRoute')}</option>
      </select></label>
      <label>{t('stepBudget')}<input type="number" min="0" step="1" value={policy.maxSteps} onChange={event => { setPolicy({ ...policy, maxSteps: Number(event.target.value) }); setSaved(false) }} /></label>
      <label>{t('tokenBudget')}<input type="number" min="0" step="1" value={policy.tokenBudget} onChange={event => { setPolicy({ ...policy, tokenBudget: Number(event.target.value) }); setSaved(false) }} /></label>
      <label>{t('estimatedBudget')}<input type="number" min="0" step="0.01" value={policy.estimatedCostBudget} onChange={event => { setPolicy({ ...policy, estimatedCostBudget: Number(event.target.value) }); setSaved(false) }} /></label>
      <label>{t('currency')}<select value={policy.currency} onChange={event => { setPolicy({ ...policy, currency: event.target.value }); setSaved(false) }}><option>CNY</option><option>USD</option></select></label>
      <p>{t('estimatedBudgetHelp')}</p>
      <details><summary>{t('routeProfiles')}</summary>
        {(['fast', 'deep'] as const).map(role => <label key={role}>{t(role === 'fast' ? 'fastRoute' : 'deepRoute')}
          <select value={routeKey(document.values.routes[role])} onChange={event => updateRoute(role, event.target.value)}>
            <option value="">{t('keepModel')}</option>{choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select>
          {choices.find(choice => choice.key === routeKey(document.values.routes[role]))?.efforts.length ? <select aria-label={t('reasoningEffort')} value={document.values.routes[role]?.reasoningEffort ?? ''} onChange={event => {
            const selected = document.values.routes[role]
            if (!selected) return
            const { reasoningEffort: _previous, ...route } = selected
            setDocument({ ...document, values: { ...document.values, routes: { ...document.values.routes, [role]: { ...route, ...(event.target.value ? { reasoningEffort: event.target.value } : {}) } } } })
            setSaved(false)
          }}><option value="">{t('providerDefault')}</option>{choices.find(choice => choice.key === routeKey(document.values.routes[role]))?.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}</select> : null}
        </label>)}
        <p>{t('routingHelp')}</p>
      </details>
      <details><summary>{t('priceSettings')}</summary>
        <p>{t('priceHelp')}</p>
        <select aria-label={t('addPrice')} value="" onChange={event => {
          const route = choices.find(choice => choice.key === event.target.value)?.route
          if (!route || document.values.prices.some(price => price.provider === route.provider && price.model === route.model)) return
          setDocument({ ...document, values: { ...document.values, prices: [...document.values.prices, { ...route, currency: 'CNY', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, source: t('userPrice') }] } })
          setSaved(false)
        }}><option value="">{t('addPrice')}</option>{choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select>
        {document.values.prices.map((price, index) => <fieldset key={`${price.provider}/${price.model}`}>
          <legend>{price.provider} / {price.model}</legend>
          {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map(key => <label key={key}>{t(key === 'input' ? 'uncached' : key === 'output' ? 'output' : key === 'cacheRead' ? 'cache' : 'cacheWrite')}<input type="number" min="0" step="0.01" value={price[key]} onChange={event => editPrice(index, key, event.target.value)} /></label>)}
          <label>{t('currency')}<select value={price.currency} onChange={event => { setDocument({ ...document, values: { ...document.values, prices: document.values.prices.map((value, position) => position === index ? { ...value, currency: event.target.value } : value) } }); setSaved(false) }}><option>CNY</option><option>USD</option></select></label>
          <label>{t('priceSource')}<input value={price.source} onChange={event => { setDocument({ ...document, values: { ...document.values, prices: document.values.prices.map((value, position) => position === index ? { ...value, source: event.target.value } : value) } }); setSaved(false) }} /></label>
          <button type="button" onClick={() => { setDocument({ ...document, values: { ...document.values, prices: document.values.prices.filter((_value, position) => position !== index) } }); setSaved(false) }}>{t('removePrice')}</button>
        </fieldset>)}
      </details>
      <button type="button" disabled={busy || !valid} onClick={() => {
        setBusy(true); setError(''); setSaved(false)
        void saveControls(sessionId, policy, document.values, document.revision).then(async () => {
          setDocument(await readControls()); setSaved(true)
        }).catch((reason: unknown) => setError(String(reason))).finally(() => setBusy(false))
      }}>{busy ? t('saving') : t('saveControls')}</button>
      {saved && <p role="status">{t('saved')}</p>}
    </>}
    </details>
    <details className={css.disclosure}><summary>{t('modelUsage')}</summary>
    {priced.map(({ row, price, amount }) => <div className={css.modelUsage} key={`${row.provider}/${row.model}`}>
      <strong>{row.provider} / {row.model}</strong>
      <p>{t('uncached')}: {row.input.toLocaleString()} · {t('output')}: {row.output.toLocaleString()}</p>
      <p>{t('cache')}: {row.cacheRead.toLocaleString()} · {t('cacheWrite')}: {row.cacheWrite.toLocaleString()}</p>
      <p>{t('estimatedCost')}: {price && amount !== undefined && Number.isFinite(amount) ? `${price.currency} ${amount.toFixed(6)} (${price.source})` : t('unknownPrice')}</p>
    </div>)}
    {economy && <p>{t('retries')}: {economy.retries} · {t('modelSwitches')}: {economy.modelSwitches}</p>}
    </details>
    <Simulator t={t} />
  </section>
}

/** 假设推演与实际用量分开呈现，不用假设成功率冒充实测结果。 */
function Simulator({ t }: { t: ControlProps['t'] }) {
  const [baseCost, setBaseCost] = useState(1)
  const [newCost, setNewCost] = useState(1)
  const [baseSuccess, setBaseSuccess] = useState(100)
  const [newSuccess, setNewSuccess] = useState(100)
  return <details><summary>{t('simulator')}</summary>
    <p>{t('simulationHelp')}</p>
    <label>{t('baselineCost')}<input type="number" min="0" step="0.01" value={baseCost} onChange={event => setBaseCost(Number(event.target.value))} /></label>
    <label>{t('forgeCost')}<input type="number" min="0" step="0.01" value={newCost} onChange={event => setNewCost(Number(event.target.value))} /></label>
    <label>{t('baselineSuccess')}<input type="number" min="0" max="100" value={baseSuccess} onChange={event => setBaseSuccess(Math.max(0, Math.min(100, Number(event.target.value))))} /></label>
    <label>{t('forgeSuccess')}<input type="number" min="0" max="100" value={newSuccess} onChange={event => setNewSuccess(Math.max(0, Math.min(100, Number(event.target.value))))} /></label>
    <p>{t('costPerSuccess')}: {baseSuccess > 0 ? (baseCost * 100 / baseSuccess).toFixed(3) : t('unknown')} → {newSuccess > 0 ? (newCost * 100 / newSuccess).toFixed(3) : t('unknown')}</p>
  </details>
}
