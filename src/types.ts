// Export a custom type named 'StintMode' so other files in your repository can use it.
// This restricts a variable to only ever accept one of these four specific, exact text values.
export type StintMode = 'Push' | 'LiCo +1' | 'Used Tyre Push' | 'Used Tyre Lico + 1'

// Export a blueprint (interface) named 'DriverProfile' to define the structure of a driver's data.
export interface DriverProfile {
  // A text string representing the unique name or initials of the driver (e.g., "CP").
  code: string
  // A number representing the time in seconds it takes the driver to complete a fast lap.
  pushPaceSec: number
  // A number representing the time in seconds it takes the driver to complete a lap while saving fuel (Lift and Coast).
  licoPaceSec: number
  // A number representing the amount of fuel (in liters) the driver burns during a fast lap.
  pushFuelUsageLiters: number
  // A number representing the amount of fuel (in liters) the driver burns during a fuel-saving lap.
  licoFuelUsageLiters: number
// Close the 'DriverProfile' interface.
}

// Export a blueprint named 'StintOption' to define the data needed for a specific driving scenario.
export interface StintOption {
  // A unique text identifier for this specific scenario.
  id: string
  // The text code of the driver performing this stint.
  driverCode: string
  // The driving style being used, which MUST match one of the three options from 'StintMode'.
  mode: StintMode
  // The time in seconds it takes to complete a lap in this specific scenario.
  durationSec: number
  // The number of laps this stint is expected to last.
  laps: number
  // The number of fresh tyre sets consumed in this stint (usually 1, or 0 if double-stinting).
  tyresUsed: number
  // The amount of fuel (in liters) consumed per lap in this scenario.
  fuelLiters: number
// Close the 'StintOption' interface.
}

// Export a blueprint named 'PitRules' to define the time penalties and rules for pit stops.
export interface PitRules {
  // The base time in seconds it takes just to drive down the pitlane.
  pitlaneBaselineSec: number
  // The time in seconds it takes to pump a single liter of fuel into the car.
  refuelTimeSecPerLiter: number
  // The time in seconds it takes the mechanics to change the tyres.
  tyreChangeTimeSec: number
  // The total number of fresh tyre sets the team has available at the start of the race.
  initialTyres: number
// Close the 'PitRules' interface.
}

// Export a blueprint named 'RaceModel' that bundles all the core race settings together.
export interface RaceModel {
  // The total duration of the race in seconds.
  raceDurationSec: number
  // The maximum extra time allowed in seconds to finish the final lap after the clock hits zero.
  finalLapAllowanceSec: number
  // The maximum number of consecutive stints a single driver is allowed to do before resting.
  maxConsecutiveStintsPerDriver: number
  // A list (array) of drivers, where each item must perfectly match the 'DriverProfile' blueprint.
  driverProfiles: DriverProfile[]
  // A list (array) of all possible driving scenarios, matching the 'StintOption' blueprint.
  stintMatrix: StintOption[]
  // The pit stop rules for this race, formatted according to the 'PitRules' blueprint.
  pitRules: PitRules
// Close the 'RaceModel' interface.
}

// Export a blueprint named 'PitInstruction' to define exactly what happens during a pit stop.
export interface PitInstruction {
  // The type of service performed, restricted to one of these four exact text strings.
  service: 'Start' | 'Fuel Only' | 'Tyre Only' | 'Full Service'
  // The total time penalty in seconds that this specific pit service costs.
  lossSec: number
// Close the 'PitInstruction' interface.
}

// Export a blueprint named 'StrategyBlock' to define a single chunk of the final race plan (like one stint).
export interface StrategyBlock {
  // The text code of the driver for this block of the race.
  driverCode: string
  // The driving style for this block, restricted by the 'StintMode' type.
  mode: StintMode
  // The timestamp (in seconds) when this driving block begins.
  startSec: number
  // The timestamp (in seconds) when this driving block ends.
  endSec: number
  // The total number of laps completed during this block.
  laps: number
  // Instructions for the pit stop at the end of this block, matching the 'PitInstruction' blueprint.
  pit: PitInstruction
  // The number of fresh tyre sets left in the garage after this block.
  tyresRemaining: number
  // The amount of fuel (in liters) required to complete this block.
  fuelLiters: number
  // A true/false (boolean) flag indicating if the driver stayed on old tyres for this block.
  doubleStinted: boolean
// Close the 'StrategyBlock' interface.
}

// Export a blueprint named 'StrategyResult' to define a complete, finished race strategy.
export interface StrategyResult {
  // A unique text identifier for this specific strategy calculation.
  id: string
  // A human-readable name for this strategy (e.g., "Safe and Steady").
  label: string
  // The main goal of this strategy, restricted to one of these three exact text strings.
  objective: 'max-laps' | 'min-pits' | 'aggressive'
  // The total number of laps completed across the entire race in this strategy.
  totalLaps: number
  // The total simulated time of the race in seconds.
  totalTimeSec: number
  // The total number of pit stops made during the race.
  pitStops: number
  // The total amount of time in seconds wasted in the pitlane over the whole race.
  pitTimeSec: number
  // The number of fresh tyre sets remaining at the very end of the race.
  tyresRemaining: number
  // A step-by-step list (array) of the race plan, where each step matches the 'StrategyBlock' blueprint.
  blocks: StrategyBlock[]
// Close the 'StrategyResult' interface.
}

// Export a blueprint named 'OptimizerOutput' to define the final package sent back by the calculator.
export interface OptimizerOutput {
  // A list (array) of one or more finished strategies, formatted as 'StrategyResult' blueprints.
  strategies: StrategyResult[]
// Close the 'OptimizerOutput' interface.
}