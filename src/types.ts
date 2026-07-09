export type StintMode = 'Push' | 'LiCo +1' | 'Used Tyre'

export interface DriverProfile {
  code: string
  pushPaceSec: number
  licoPaceSec: number
  pushFuelUsageLiters: number
  licoFuelUsageLiters: number
}

export interface StintOption {
  id: string
  driverCode: string
  mode: StintMode
  durationSec: number
  laps: number
  tyresUsed: number
  fuelLiters: number
}

export interface PitRules {
  pitlaneBaselineSec: number
  refuelTimeSecPerLiter: number
  tyreChangeTimeSec: number
  initialTyres: number
}

export interface RaceModel {
  raceDurationSec: number
  finalLapAllowanceSec: number
  maxConsecutiveStintsPerDriver: number
  driverProfiles: DriverProfile[]
  stintMatrix: StintOption[]
  pitRules: PitRules
}

export interface PitInstruction {
  service: 'Start' | 'Fuel Only' | 'Tyre Only' | 'Full Service'
  lossSec: number
}

export interface StrategyBlock {
  driverCode: string
  mode: StintMode
  startSec: number
  endSec: number
  laps: number
  pit: PitInstruction
  tyresRemaining: number
  fuelLiters: number
  doubleStinted: boolean
}

export interface StrategyResult {
  id: string
  label: string
  objective: 'max-laps' | 'min-pits' | 'aggressive'
  totalLaps: number
  totalTimeSec: number
  pitStops: number
  pitTimeSec: number
  tyresRemaining: number
  blocks: StrategyBlock[]
}

export interface OptimizerOutput {
  strategies: StrategyResult[]
}
