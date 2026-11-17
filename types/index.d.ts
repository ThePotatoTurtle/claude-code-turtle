export type Greeted = boolean

declare module 'claude-code' {
  interface PluginState {
    'turtle': { isGreeted: Greeted }
  }
}
