import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextFill } from '../types'

const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const colorFor = (percent: number) => (percent >= 85 ? 'error' : percent >= 70 ? 'warning' : 'success')

async function store($: EngineInterface, { tokens, window, percent }: ContextFill) {
  await update($, fill, () => ({ tokens, window, percent }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await store($, (await $.session.usage()).context)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await store($, e.context)
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    await update($, fill, () => null).catch(() => {})
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, fill)
    if (e.props.hasSurvey || !current) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const percent = current.percent ?? 0
    const width = Math.max(10, Math.min(40, e.props.bodyColumns - 30))
    const filled = Math.min(width, Math.round((percent / 100) * width))
    const tokens = current.tokens === undefined ? '—' : formatTokens(current.tokens)

    return (
      <Box>
        <Text dimColor>ctx </Text>
        <Text color={colorFor(percent)}>{'█'.repeat(filled)}</Text>
        <Text dimColor>{'░'.repeat(width - filled)}</Text>
        <Text color={colorFor(percent)}> {percent}%</Text>
        <Text dimColor>
          {' '}
          · {tokens} / {formatTokens(current.window)}
        </Text>
      </Box>
    )
  })
}
