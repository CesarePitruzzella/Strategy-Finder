import type { DriverProfile, OptimizerOutput, RaceModel, StrategyBlock, StrategyResult } from './types'

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000

const raceHeadroom = (model: RaceModel): number => model.raceDurationSec + model.finalLapAllowanceSec

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const targetBlockLaps = (model: RaceModel): number => {
  const estimate = Math.round(model.raceDurationSec / (Math.max(model.driverProfiles.length, 1) * 1800))
  return clamp(estimate, 2, 8)
}

const blockServiceLoss = (model: RaceModel, fuelLiters: number, isFirstBlock: boolean): number => {
  if (isFirstBlock) {
    return 0
  }

  return model.pitRules.pitlaneBaselineSec + model.pitRules.tyreChangeTimeSec + fuelLiters * model.pitRules.refuelTimeSecPerLiter
}

const estimateBlockScore = (driver: DriverProfile, mode: 'Push' | 'LiCo +1', model: RaceModel): number => {
  const paceSec = mode === 'Push' ? driver.pushPaceSec : driver.licoPaceSec
  const fuelLiters = mode === 'Push' ? driver.pushFuelUsageLiters : driver.licoFuelUsageLiters
  return paceSec + blockServiceLoss(model, fuelLiters, false)
}

const chooseMode = (
  driver: DriverProfile,
  objective: StrategyResult['objective']
): 'Push' | 'LiCo +1' => {
  if (objective === 'aggressive') {
    return 'Push'
  }

  if (objective === 'min-pits') {
    return driver.licoFuelUsageLiters <= driver.pushFuelUsageLiters ? 'LiCo +1' : 'Push'
  }

  return driver.pushPaceSec <= driver.licoPaceSec ? 'Push' : 'LiCo +1'
}

const orderDrivers = (model: RaceModel, objective: StrategyResult['objective']): DriverProfile[] => {
  const drivers = [...model.driverProfiles]

  if (objective === 'min-pits') {
    return drivers.sort((left, right) => {
      const leftFuel = Math.min(left.pushFuelUsageLiters, left.licoFuelUsageLiters)
      const rightFuel = Math.min(right.pushFuelUsageLiters, right.licoFuelUsageLiters)
      return leftFuel - rightFuel || left.pushPaceSec - right.pushPaceSec
    })
  }

  if (objective === 'aggressive') {
    return drivers.sort((left, right) => left.pushPaceSec - right.pushPaceSec)
  }

  return drivers.sort((left, right) => {
    const leftScore = Math.min(
      estimateBlockScore(left, 'Push', model),
      estimateBlockScore(left, 'LiCo +1', model)
    )
    const rightScore = Math.min(
      estimateBlockScore(right, 'Push', model),
      estimateBlockScore(right, 'LiCo +1', model)
    )
    return leftScore - rightScore
  })
}

const buildStrategy = (model: RaceModel, objective: StrategyResult['objective'], label: string): StrategyResult => {
  const maxTimeSec = raceHeadroom(model)
  const order = orderDrivers(model, objective)
  const blocks: StrategyBlock[] = []
  let currentTimeSec = 0
  let currentTyresRemaining = model.pitRules.initialTyres
  let pitStops = 0
  let pitTimeSec = 0
  let totalLaps = 0
  const coveredDrivers = new Set<string>()
  const blockLapTarget = targetBlockLaps(model)

  while (currentTimeSec < maxTimeSec && order.length > 0) {
    for (let index = 0; index < order.length && currentTimeSec < maxTimeSec; index += 1) {
      const cycleIndex = Math.floor(blocks.length / order.length)
      const driver = order[index]
      const mode = chooseMode(driver, objective)
      const paceSec = mode === 'Push' ? driver.pushPaceSec : driver.licoPaceSec
      const fuelPerLap = mode === 'Push' ? driver.pushFuelUsageLiters : driver.licoFuelUsageLiters
      const fuelLiters = fuelPerLap * blockLapTarget
      const isFirstBlock = blocks.length === 0
      const drivingDuration = paceSec * blockLapTarget
      const pitLoss = blockServiceLoss(model, fuelLiters, isFirstBlock)
      const blockDuration = drivingDuration + pitLoss
      if (blockDuration <= 0) {
        continue
      }

      const remaining = maxTimeSec - currentTimeSec
      if (remaining <= 0) {
        break
      }

      const effectiveDuration = Math.min(blockDuration, remaining)
      const completedDrivingDuration = Math.min(drivingDuration, effectiveDuration)
      const lapGain = completedDrivingDuration / paceSec
      const doubleStinted = cycleIndex > 0
      const pitService = isFirstBlock ? 'Start' : doubleStinted ? 'Full Service' : 'Fuel Only'
      const blockEndSec = currentTimeSec + completedDrivingDuration

      blocks.push({
        driverCode: driver.code,
        mode,
        startSec: currentTimeSec,
        endSec: blockEndSec,
        laps: round4(lapGain),
        pit: {
          service: pitService,
          lossSec: pitLoss,
        },
        tyresRemaining: currentTyresRemaining,
        fuelLiters: round4(fuelLiters),
        doubleStinted,
      })

      currentTimeSec += isFirstBlock ? completedDrivingDuration : completedDrivingDuration + pitLoss
      totalLaps += lapGain
      if (!doubleStinted && currentTyresRemaining > 0) {
        currentTyresRemaining -= 1
      }
      if (!isFirstBlock) {
        pitStops += 1
        pitTimeSec += pitLoss
      }
      coveredDrivers.add(driver.code)

      if (currentTimeSec >= maxTimeSec - 1) {
        break
      }
    }
  }

  model.driverProfiles.forEach((driver) => coveredDrivers.add(driver.code))

  return {
    id: `${objective}-strategy`,
    label,
    objective,
    totalLaps: round4(totalLaps),
    totalTimeSec: round4(currentTimeSec),
    pitStops,
    pitTimeSec: round4(pitTimeSec),
    tyresRemaining: currentTyresRemaining,
    blocks,
  }
}

export const optimizeRace = (model: RaceModel): OptimizerOutput => {
  const strategies: StrategyResult[] = [
    buildStrategy(model, 'max-laps', 'Maximum Lap Pace Optimum'),
    buildStrategy(model, 'min-pits', 'Energy-Saving / Minimum Pit Stop Profile'),
    buildStrategy(model, 'aggressive', 'Aggressive Sprint / Fresh Rubber Profile'),
  ]

  return {
    strategies,
  }
}
