import type { Hook } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const engineBand: Hook<'ui.render'> = ($, e) => {
  const { Text } = $.ui.resolve(e)
  return <Text>engine</Text>
}

test('stays hidden before the first measurement', async ($, on) => {
  on('ui.render', engineBand)
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
})

test('shows the fill after a measurement', async ($, on) => {
  on('ui.render', engineBand)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 104_000, window: 200_000, percent: 52 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /52%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /104k \/ 200k/ })).toBeDefined()
    await ui.unmount()
  }
})

test('Details toggles the breakdown pane', async ($, on) => {
  let open: string[] = []
  on('ui.render', engineBand)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.open', (_, e) => {
    open = [...open, e.id]
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    open = open.filter(id => id !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: open.map(id => ({ id, title: 'Context Usage', isShown: true, isFocused: true, isPlaced: true })),
  }))
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  await ui.press({ key: 'details' })
  expect(open).toEqual(['context-details'])
  await ui.press({ key: 'details' })
  expect(open).toEqual([])
  await ui.unmount()
})

test('the pane lists the categories', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        tokens: 50_000,
        window: 200_000,
        percent: 25,
        breakdown: {
          categories: [
            { name: 'Messages', tokens: 30_000, color: 'purple', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 150_000, color: 'inactive', isDeferred: false, kind: 'free' },
          ],
          totalTokens: 50_000,
          maxTokens: 200_000,
          rawMaxTokens: 200_000,
          autocompactSource: 'auto',
          percentage: 25,
          gridRows: [
            [
              {
                color: 'purple',
                isFilled: true,
                categoryName: 'Messages',
                tokens: 30_000,
                percentage: 15,
                squareFullness: 1,
              },
            ],
          ],
          model: 'claude-test',
          memoryFiles: [],
          mcpTools: [],
          agents: [],
          isAutoCompactEnabled: false,
          apiUsage: null,
        },
      },
    },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'context-bar',
      surface,
      component: 'Pane',
      requestId: 'context-details',
      props: {
        title: 'Context Usage',
        isFocused: true,
        bodyColumns: 100,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /claude-test/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Messages/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /150k \(75%\)/ })).toBeDefined()
    await ui.unmount()
  }
})
