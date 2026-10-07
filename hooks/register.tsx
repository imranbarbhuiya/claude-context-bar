import { atom, read, update } from 'claude-code'
import type { ContextCategoryKind, EngineInterface, Register } from 'claude-code'

import type { ContextFill } from '../types'

const PANE = 'context-details'
const fill = atom({ plugin: 'context-bar', key: 'fill' } as const, null)
const isVisible = atom({ plugin: 'context-bar', key: 'isVisible' } as const, false)

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`

const colorFor = (percent: number) => (percent >= 85 ? 'error' : percent >= 70 ? 'warning' : 'success')

const squareFor = (kind: ContextCategoryKind | undefined, fullness: number) =>
  kind === 'free' ? '⛶' : kind === 'buffer' ? '⛝' : fullness >= 0.7 ? '⛁' : '⛀'

const percentOf = (tokens: number, window: number) => `${+((tokens / window) * 100).toFixed(1)}%`

async function toggleDetails($: EngineInterface) {
  const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
  } else {
    await $.ui.open({ id: PANE, title: 'Context Usage', focus: true, closeOnEscape: true })
  }
  return !isOpen
}

async function store($: EngineInterface, { tokens, window, percent }: ContextFill) {
  await update($, fill, () => ({ tokens, window, percent }))
}

export const register: Register = (on, options) => {
  const show = options.show

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'context-bar', description: 'Show or hide the context usage bar' })
    await $.command.register({ name: 'context-details', description: 'Show or hide the context usage breakdown' })
    const isShown = show === 'always' || (show === 'remember' && (await $.store.get('isVisible')) === true)
    await update($, isVisible, () => isShown)
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

  on('command.run', { command: 'context-bar' }, async $ => {
    const isShown = !(await read($, isVisible))
    await update($, isVisible, () => isShown)
    if (show === 'remember') {
      await $.store.set('isVisible', isShown)
    }
    return { text: `Context bar ${isShown ? 'shown' : 'hidden'}.` }
  })

  on('command.run', { command: 'context-details' }, async $ => {
    const isOpen = await toggleDetails($)
    return { text: `Context usage pane ${isOpen ? 'opened' : 'closed'}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, fill)
    if (e.props.hasSurvey || !current || !(await read($, isVisible))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const percent = current.percent ?? 0
    const width = Math.max(10, Math.min(40, e.props.bodyColumns - 42))
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
          · {tokens} / {formatTokens(current.window)}{' '}
        </Text>
        <Button key="details" label="Details" hotkey="d" dimColor onPress={() => toggleDetails($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, fill)
    const { breakdown } = (await $.session.usage({ breakdown: 'summary', columns: e.props.bodyColumns })).context

    if (!breakdown) {
      return <Text dimColor>No context usage yet.</Text>
    }

    const kindOf = new Map(breakdown.categories.map(c => [c.name, c.kind]))
    const window = breakdown.rawMaxTokens
    const gridWidth = (breakdown.gridRows[0]?.length ?? 10) * 2
    const isSideBySide = e.props.bodyColumns >= gridWidth + 44
    const loadedMcp = breakdown.mcpTools.filter(tool => tool.isLoaded)
    const sum = (rows: readonly { tokens: number }[]) => rows.reduce((total, row) => total + row.tokens, 0)

    return (
      <Box flexDirection="column">
        <Box flexDirection={isSideBySide ? 'row' : 'column'}>
          <Box flexDirection="column" marginRight={3} marginBottom={isSideBySide ? 0 : 1}>
            {breakdown.gridRows.map(row => (
              <Text>
                {row.map(square => (
                  <Text color={square.color}>{squareFor(kindOf.get(square.categoryName), square.squareFullness)} </Text>
                ))}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column">
            <Text bold>{breakdown.model}</Text>
            <Text dimColor>
              {formatTokens(breakdown.totalTokens)}/{formatTokens(window)} tokens ({breakdown.percentage}%)
            </Text>
            <Text> </Text>
            <Text dimColor italic>
              Estimated usage by category
            </Text>
            {breakdown.categories
              .filter(c => c.tokens > 0 && c.kind !== 'deferred')
              .map(c => (
                <Text>
                  <Text color={c.color}>{squareFor(c.kind, 1)} </Text>
                  <Text bold>{c.name}: </Text>
                  <Text dimColor>
                    {formatTokens(c.tokens)}
                    {c.kind === 'free' ? '' : ' tokens'} ({percentOf(c.tokens, window)})
                  </Text>
                </Text>
              ))}
          </Box>
        </Box>
        <Text> </Text>
        {breakdown.isAutoCompactEnabled && breakdown.autoCompactThreshold !== undefined && (
          <Text>
            <Text bold>Auto-compact at: </Text>
            <Text dimColor>{formatTokens(breakdown.autoCompactThreshold)} tokens</Text>
          </Text>
        )}
        {breakdown.mcpTools.length > 0 && (
          <Text>
            <Text bold>MCP tools</Text>
            <Text dimColor>
              {' '}
              · {breakdown.mcpTools.length} tools, {loadedMcp.length} loaded · {formatTokens(sum(loadedMcp))} tokens
            </Text>
          </Text>
        )}
        {breakdown.memoryFiles.length > 0 && (
          <Text>
            <Text bold>Memory files</Text>
            <Text dimColor>
              {' '}
              · {breakdown.memoryFiles.length} files · {formatTokens(sum(breakdown.memoryFiles))} tokens
            </Text>
          </Text>
        )}
        {breakdown.skills && (
          <Text>
            <Text bold>Skills</Text>
            <Text dimColor>
              {' '}
              · {breakdown.skills.includedSkills} skills · {formatTokens(breakdown.skills.tokens)} tokens
            </Text>
          </Text>
        )}
        {breakdown.agents.length > 0 && (
          <Text>
            <Text bold>Agents</Text>
            <Text dimColor>
              {' '}
              · {breakdown.agents.length} agents · {formatTokens(sum(breakdown.agents))} tokens
            </Text>
          </Text>
        )}
      </Box>
    )
  })
}
