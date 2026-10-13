import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './forge.module.css'

// 静态像素画改编自 ccch1mneyyy/dsh-TUI 的 standard 帧，原画作者 @lhh010。
// 授权与来源见包内 THIRD_PARTY_NOTICES.md。
const rows = [
  '........................................',
  '........................................',
  '........................D...............',
  '.......................DBD.......D......',
  '.......................DBBD.....DBD.....',
  '.......................DBBBD..DDBBD.....',
  '.......................DBBBBDDBBBBD.....',
  '.......DDDDDDDDD........DBBBBBBBBD......',
  '......DBBBBBBBBBDD.......DBBBBBBBD......',
  '.....DBBBBBBBBBBBBDD.....DBBBBBDD.......',
  '....DBBBBBBBBBBBBBBBDD....DBBBD.........',
  '...DDBBBBBBBBBBBBBBBBBD..DBBBBD.........',
  '...DBBBBBBBBBBBBBBBBBBBDDBBBBBD.........',
  '...DBBBDBBBBBBDBBBBBBBBBBBBBBBD.........',
  '...DBBBDBBBBBBDBBBBBBBBBBBBBBD..........',
  '...DBBBBBBBBBBBBBBBBBBBBBBBBBD..........',
  '...DBBBBWWWWWWWBBBBBBBBDBBBBD...........',
  '...DDBWWWWWWWWWWWWBBBBBBDBBBD...........',
  '....DLLWWWWWWWWWWWWDBBBBDDBD............',
  '.....DLLLWWWWWWWWWWDBBBBBDD.............',
  '......DDLLLWWWWWWLLLDBBBBBDD............',
  '........DLLLLLLLLLLLDDBBBBBBD...........',
  '.........DDDDDDDDDDD..DDDDDDD...........',
  '........................................',
  '........................................',
]

const paths = ['D', 'B', 'L', 'W'].map(color => ({ color, d: rows.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === color ? [`M${x} ${y}h1v1h-1z`] : [])).join('') }))

/** 像素轮廓使用 SVG 保持缩放清晰，静态显示无需动画定时器。 */
export function PixelWhale({ size }: { size: number }) {
  return <svg className={css.whale} width={size} height={size * 25 / 40} viewBox="0 0 40 25" shapeRendering="crispEdges" aria-hidden="true">{paths.map(path => <path key={path.color} d={path.d} fill={`var(--forge-whale-${path.color})`} />)}</svg>
}

type HeroProps = PropsRuntime<'conversation.hero.brand.mark'> & PropsLocale<'forge'> & InjectFace<{ openAuxiliary: () => void; openFiles: () => void }>

/** 启动页只提供原生功能入口，输入与发送仍由现有会话组件负责。 */
export function WhaleHero({ t, openAuxiliary, openFiles }: HeroProps) {
  return <div className={css.whaleHero} data-forge-whale-hero>
    <div className={css.whaleWelcome}><PixelWhale size={168} /><div><span className={css.eyebrow}>{t('terminalWorkspace')}</span><h1>DEEPSEEK<span>FORGE</span></h1><p>{t('whaleWelcome')}</p></div></div>
    <div className={css.heroActions}><button type="button" onClick={openFiles}>{t('files')}</button><span aria-hidden="true">/</span><button type="button" onClick={openAuxiliary}>{t('auxiliary')}</button></div>
    <p className={css.heroHints}>{t('terminalHints')}</p>
  </div>
}
