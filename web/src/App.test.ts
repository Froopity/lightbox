import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

describe('App', () => {
  it('renders the title', () => {
    expect(mount(App).text()).toContain('Lightbox')
  })
})
