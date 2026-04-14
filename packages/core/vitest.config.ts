import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { globals: true },
    // silence CJS deprecation warning
  build: { target: 'esnext' }
})