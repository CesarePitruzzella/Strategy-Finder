import { optimizeRace } from '../optimizer'
import type { OptimizerOutput, RaceModel } from '../types'

interface OptimizeRequest {
  model: RaceModel
}

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<OptimizeRequest>) => {
  try {
    const result: OptimizerOutput = optimizeRace(event.data.model)
    ctx.postMessage({ ok: true, result })
  } catch (error) {
    ctx.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Unknown optimizer error' })
  }
}
