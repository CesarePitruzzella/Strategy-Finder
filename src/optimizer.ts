import type { OptimizerOutput, RaceModel, StrategyBlock, StrategyResult, StintOption } from './types'

interface State {
  timeSec: number
  laps: number
  tyresRemaining: number
  currentDriver: string | null
  consecutiveDriverStints: number
  pitStops: number
  pitTimeSec: number
  blocks: StrategyBlock[]
}

const TIME_BUCKET_SEC = 30

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000

const pitServiceForStint = (stint: StintOption) => {
  if (stint.tyresUsed > 0) {
    return 'Full Service' as const
  }
  return 'Fuel Only' as const
}

const strategyFingerprint = (strategy: StrategyResult): string =>
  strategy.blocks.map((block) => `${block.driverCode}-${block.mode}-${Math.round(block.startSec / 60)}`).join('|')

const scoreStrategy = (strategy: StrategyResult, objective: StrategyResult['objective']): number => {
  const remainingSec = Math.max(0, strategy.totalTimeSec)
  const pushBlocks = strategy.blocks.filter((block) => block.mode === 'Push').length
  const tyresUsed = strategy.blocks.length === 0 ? 0 : strategy.blocks[0].tyresRemaining - strategy.tyresRemaining

  if (objective === 'min-pits') {
    return strategy.totalLaps * 10_000 - strategy.pitStops * 250 - strategy.pitTimeSec * 0.25
  }

  if (objective === 'aggressive') {
    return strategy.totalLaps * 9_000 + pushBlocks * 150 + tyresUsed * 5 - strategy.pitStops * 30 - remainingSec * 0.1
  }

  return strategy.totalLaps * 10_000 - remainingSec * 0.2
}

const pickDistinct = (candidates: StrategyResult[]): StrategyResult[] => {
  const objectives: Array<{ key: StrategyResult['objective']; label: string }> = [
    { key: 'max-laps', label: 'Maximum Lap Pace Optimum' },
    { key: 'min-pits', label: 'Energy-Saving / Minimum Pit Stop Profile' },
    { key: 'aggressive', label: 'Aggressive Sprint / Fresh Rubber Profile' },
  ]

  const selected: StrategyResult[] = []

  objectives.forEach(({ key, label }) => {
    const sorted = [...candidates].sort((left, right) => scoreStrategy(right, key) - scoreStrategy(left, key))

    const pick =
      sorted.find(
        (candidate) =>
          !selected.some((alreadyPicked) => strategyFingerprint(alreadyPicked) === strategyFingerprint(candidate))
      ) ?? sorted[0]

    if (pick) {
      selected.push({
        ...pick,
        objective: key,
        label,
        id: `${key}-${pick.id}`,
      })
    }
  })

  return selected.slice(0, 3)
}

const stateKey = (state: State): string => {
  const timeBucket = Math.floor(state.timeSec / TIME_BUCKET_SEC)
  return `${timeBucket}|${state.tyresRemaining}|${state.currentDriver ?? '_'}|${state.consecutiveDriverStints}`
}

const dominates = (left: State, right: State): boolean => {
  return (
    left.laps >= right.laps &&
    left.timeSec <= right.timeSec &&
    left.tyresRemaining >= right.tyresRemaining &&
    left.pitStops <= right.pitStops
  )
}

export const optimizeRace = (model: RaceModel): OptimizerOutput => {
  const maxTimeSec = model.raceDurationSec + model.finalLapAllowanceSec
  const frontier: State[] = [
    {
      timeSec: 0,
      laps: 0,
      tyresRemaining: model.pitRules.initialTyres,
      currentDriver: null,
      consecutiveDriverStints: 0,
      pitStops: 0,
      pitTimeSec: 0,
      blocks: [],
    },
  ]

  const bestByKey = new Map<string, State>()
  const finals: State[] = []

  while (frontier.length > 0) {
    const current = frontier.pop()
    if (!current) {
      continue
    }

    let expanded = false

    for (const stint of model.stintMatrix) {
      const isDriverRepeated = current.currentDriver === stint.driverCode
      const consecutive = isDriverRepeated ? current.consecutiveDriverStints + 1 : 1
      if (consecutive > model.maxConsecutiveStintsPerDriver) {
        continue
      }

      if (stint.tyresUsed > current.tyresRemaining) {
        continue
      }

      const isFirstStint = current.blocks.length === 0
      const pitService = isFirstStint ? 'Start' : pitServiceForStint(stint)
      const pitLoss = isFirstStint
        ? 0
        : model.pitRules.pitlaneBaselineSec +
          (pitService === 'Full Service' ? model.pitRules.fullServiceSec : model.pitRules.fuelOnlySec)

      const blockDuration = stint.durationSec + pitLoss
      const remaining = maxTimeSec - current.timeSec
      if (remaining <= 0) {
        continue
      }

      const isFinalPartial = blockDuration > remaining
      const effectiveDuration = isFinalPartial ? remaining : blockDuration
      const lapGain = stint.laps * (effectiveDuration / blockDuration)

      const next: State = {
        timeSec: current.timeSec + effectiveDuration,
        laps: round4(current.laps + lapGain),
        tyresRemaining: current.tyresRemaining - stint.tyresUsed,
        currentDriver: stint.driverCode,
        consecutiveDriverStints: consecutive,
        pitStops: current.pitStops + (isFirstStint ? 0 : 1),
        pitTimeSec: current.pitTimeSec + pitLoss,
        blocks: [
          ...current.blocks,
          {
            driverCode: stint.driverCode,
            mode: stint.mode,
            startSec: current.timeSec,
            endSec: current.timeSec + effectiveDuration,
            laps: round4(lapGain),
            pit: {
              service: pitService,
              lossSec: pitLoss,
            },
            tyresRemaining: current.tyresRemaining - stint.tyresUsed,
            fuelLiters: stint.fuelLiters,
          },
        ],
      }

      if (next.timeSec >= maxTimeSec - 1 || isFinalPartial) {
        finals.push(next)
        expanded = true
        continue
      }

      const key = stateKey(next)
      const existing = bestByKey.get(key)
      if (existing && dominates(existing, next)) {
        expanded = true
        continue
      }

      if (!existing || dominates(next, existing)) {
        bestByKey.set(key, next)
      }

      frontier.push(next)
      expanded = true
    }

    if (!expanded && current.blocks.length > 0) {
      finals.push(current)
    }
  }

  const candidates = finals
    .map((state, index) => ({
      id: `candidate-${index}`,
      label: 'Candidate',
      objective: 'max-laps' as const,
      totalLaps: round4(state.laps),
      totalTimeSec: round4(state.timeSec),
      pitStops: state.pitStops,
      pitTimeSec: round4(state.pitTimeSec),
      tyresRemaining: state.tyresRemaining,
      blocks: state.blocks,
    }))
    .sort((left, right) => right.totalLaps - left.totalLaps)
    .slice(0, 100)

  return {
    strategies: pickDistinct(candidates),
  }
}
