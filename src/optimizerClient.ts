import type { OptimizerOutput, RaceModel } from './types'

export const runOptimizerInWorker = (model: RaceModel): Promise<OptimizerOutput> => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/optimizer.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: OptimizerOutput; error?: string }>) => {
      worker.terminate()
      if (!event.data.ok || !event.data.result) {
        reject(new Error(event.data.error ?? 'Optimizer failed'))
        return
      }
      resolve(event.data.result)
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Worker runtime error'))
    }

    worker.postMessage({ model })
  })
}
