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
