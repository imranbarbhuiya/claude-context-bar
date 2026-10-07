import type { Hook, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
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

const startSession = async ($: Engine, on: On) => {
  on('ui.render', engineBand)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 200_000 } } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { tokens: 104_000, window: 200_000, percent: 52 },
    rateLimits: [],
    changed: ['context'],
  })
}

const runCommand = ($: Engine, command: string) =>
  $.command.run({
    command,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })

const isBarShown = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
  const found = await ui.find({ type: 'Text', text: /52%/ })
  await ui.unmount()
  return found !== undefined
}

test('stays hidden before the first measurement', { options: { show: 'always' } }, async ($, on) => {
  on('ui.render', engineBand)
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
})

test('on-demand: hidden until /context-bar, which toggles it', async ($, on) => {
  await startSession($, on)
  expect(await isBarShown($)).toBe(false)

  expect(await runCommand($, 'context-bar')).toEqual({ text: 'Context bar shown.' })
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await isBarShown($, surface)).toBe(true)
  }
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /104k \/ 200k/ })).toBeDefined()
  await ui.unmount()

  expect(await runCommand($, 'context-bar')).toEqual({ text: 'Context bar hidden.' })
  expect(await isBarShown($)).toBe(false)
})

test('always: shown from the start', { options: { show: 'always' } }, async ($, on) => {
  await startSession($, on)
  expect(await isBarShown($)).toBe(true)
})

test('remember: starts as /context-bar last left it', { options: { show: 'remember' } }, async ($, on) => {
  const saved = new Map<string, unknown>([['isVisible', true]])
  on('store.get', (_, e) => ({ value: saved.get(e.key) }))
  on('store.set', (_, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  await startSession($, on)
  expect(await isBarShown($)).toBe(true)

  await runCommand($, 'context-bar')
  expect(saved.get('isVisible')).toBe(false)
})

test('Details and /context-details toggle the breakdown pane', async ($, on) => {
  let open: string[] = []
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
  await startSession($, on)
  await runCommand($, 'context-bar')

  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  await ui.press({ key: 'details' })
  expect(open).toEqual(['context-details'])
  await ui.press({ key: 'details' })
  expect(open).toEqual([])
  await ui.unmount()

  expect(await runCommand($, 'context-details')).toEqual({ text: 'Context usage pane opened.' })
  expect(await runCommand($, 'context-details')).toEqual({ text: 'Context usage pane closed.' })
  expect(open).toEqual([])
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
