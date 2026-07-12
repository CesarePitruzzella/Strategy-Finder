// Import the 'Papa' object and the 'ParseResult' type from the 'papaparse' library, which is a tool used to read CSV files.
import Papa, { type ParseResult } from 'papaparse'
// Import our custom TypeScript types (like blueprints) from a local 'types.ts' file so we can structure our data properly.
import type { DriverProfile, RaceModel, PitRules, StintMode, StintOption } from './types'

// Define a structure named 'Row' to represent a single row of data from the CSV file.
interface Row {
  // Specify that any column header (key) is a string, and its contents can be a string, number, null, or empty (undefined).
  [key: string]: string | number | null | undefined
// Close the 'Row' interface.
}

// Define a fallback value for the race duration (12 hours calculated in seconds) in case the CSV doesn't provide one.
const DEFAULT_RACE_DURATION_SEC = 12 * 60 * 60
const DEFAULT_FINAL_LAP_ALLOWANCE_SEC = 150
// Define a default limit for how many times a driver can stay in the car without resting (3 stints).
const DEFAULT_MAX_CONSECUTIVE_STINTS = 3

// Create a function called 'normalizeKey' that takes a string (like a column header) and cleans it up.
const normalizeKey = (value: string): string =>
  // It removes extra spaces, makes all letters lowercase, and deletes any special characters (keeping only letters and numbers).
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

// Create a function called 'parseDurationToSec' that converts a time input (like "1:30:00") into total seconds.
const parseDurationToSec = (value: string | number | null | undefined): number => {
  // Check if the value is already a valid, positive number...
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // ...if it is, just return that number directly.
    return value
  // Close the if statement.
  }

  // Check if the value is NOT a string (meaning it's missing or invalid)...
  if (typeof value !== 'string') {
    // ...if so, return 0 seconds as a safe fallback.
    return 0
  // Close the if statement.
  }

  // Remove any extra spaces from the beginning and end of the string.
  const trimmed = value.trim()
  // Check if the string is empty after removing spaces...
  if (!trimmed) {
    // ...if it is empty, return 0.
    return 0
  // Close the if statement.
  }

  // Check if the string is just a plain number or decimal (using a Regular Expression).
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    // If it's a plain number string, convert it into an actual Number format and return it.
    return Number(trimmed)
  // Close the if statement.
  }

  // Split the string by colons (e.g., "1:30" becomes ["1", "30"]) and convert each piece into a number.
  const parts = trimmed.split(':').map((chunk) => Number(chunk.trim()))
  // Check if any of the separated pieces failed to convert to a number or are negative...
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    // ...if they are invalid, return 0.
    return 0
  // Close the if statement.
  }

  // Check if the time was provided in a "Minutes:Seconds" format (meaning there are 2 parts).
  if (parts.length === 2) {
    // Multiply the minutes by 60 and add the seconds, then return the total.
    return parts[0] * 60 + parts[1]
  // Close the if statement.
  }

  // Check if the time was provided in an "Hours:Minutes:Seconds" format (meaning there are 3 parts).
  if (parts.length === 3) {
    // Multiply hours by 3600, minutes by 60, add the seconds, and return the total.
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  // Close the if statement.
  }

  // If the format doesn't match any of the above, return 0 as a final safety net.
  return 0
// Close the 'parseDurationToSec' function.
}

// Create a function called 'getValue' to search a CSV row for a specific piece of data using different possible column names (aliases).
const getValue = (row: Row, aliases: string[]): string | number | null | undefined => {
  // Convert the row object into an array of key-value pairs so we can search through them.
  const entries = Object.entries(row)
  // Loop through the list of possible column names, cleaning them up with 'normalizeKey' first.
  for (const alias of aliases.map(normalizeKey)) {
    // Try to find a column header in the row that exactly matches our cleaned-up alias.
    const match = entries.find(([key]) => normalizeKey(key) === alias)
    // If we successfully found a matching column...
    if (match) {
      // ...return the data located inside that column (index 1 holds the value, index 0 holds the key).
      return match[1]
    // Close the if statement.
    }
  // Close the for loop.
  }
  // If we checked all aliases and found nothing, return undefined.
  return undefined
// Close the 'getValue' function.
}

// Create a function called 'toNumber' to safely convert a value into a number, providing a fallback if it fails.
const toNumber = (value: string | number | null | undefined, fallback = 0): number => {
  // Check if the value is already a valid, standard number...
  if (typeof value === 'number' && Number.isFinite(value)) {
    // ...if so, just return it.
    return value
  // Close the if statement.
  }
  // Check if the value is a string...
  if (typeof value === 'string') {
    // ...attempt to convert the string into a number.
    const parsed = Number(value)
    // If the conversion worked (it's a finite number), return it; otherwise, return the fallback value.
    return Number.isFinite(parsed) ? parsed : fallback
  // Close the if statement.
  }
  // If the value is neither a number nor a string, return the fallback value.
  return fallback
// Close the 'toNumber' function.
}

// Create an asynchronous function 'parseCsv' that reads an uploaded File and turns it into an array of Rows.
const parseCsv = async (file: File): Promise<Row[]> => {
  // Extract the raw text content out of the uploaded file.
  const text = await file.text()
  // Return a new Promise (a background task) that will either succeed (resolve) or fail (reject).
  return new Promise<Row[]>((resolve, reject) => {
    // Use the PapaParse library to parse the raw text, specifying that we expect 'Row' objects.
    Papa.parse<Row>(text, {
      // Tell PapaParse that the first row of the CSV contains our column headers.
      header: true,
      // Tell PapaParse to ignore any completely blank lines in the file.
      skipEmptyLines: true,
      // Define what to do when the parsing is finished.
      complete: (result: ParseResult<Row>) => {
        // If PapaParse encountered any errors while reading...
        if (result.errors.length > 0) {
          // ...fail the Promise and pass along the first error message.
          reject(new Error(result.errors[0].message))
          // Stop executing the function here.
          return
        // Close the if statement.
        }
        // If there were no errors, succeed the Promise and return the formatted data.
        resolve(result.data)
      // Close the 'complete' callback.
      },
      // Define what to do if a catastrophic error occurs during parsing.
      error: (error: Error) => reject(error),
    // Close the PapaParse configuration object and the function call.
    })
  // Close the Promise definition.
  })
// Close the 'parseCsv' function.
}

// Create a function 'normalizeHeaders' to get all column headers from the CSV and clean them up.
const normalizeHeaders = (rows: Row[]): string[] =>
  // If there are rows, grab the keys (headers) from the first row and normalize them; otherwise, return an empty array.
  rows.length > 0 ? Object.keys(rows[0]).map((header) => normalizeKey(header)) : []

// Create a function 'requireHeaders' that checks if the user uploaded a CSV with all the necessary columns.
const requireHeaders = (rows: Row[], requiredHeaders: string[], fileLabel: string): void => {
  // Get all the actual headers from the file and store them in a Set (a collection of unique values) for fast checking.
  const headers = new Set(normalizeHeaders(rows))
  // Create a list of missing headers by filtering the required list for items that don't exist in our actual headers.
  const missing = requiredHeaders.filter((header) => !headers.has(normalizeKey(header)))
  // If there is at least one missing header...
  if (missing.length > 0) {
    // ...crash this specific process and throw an error telling the user exactly which columns are missing.
    throw new Error(`${fileLabel} is missing required columns: ${missing.join(', ')}`)
  // Close the if statement.
  }
// Close the 'requireHeaders' function.
}

// Create a function 'parseDriverProfiles' that loops through the CSV rows to build our list of drivers.
const parseDriverProfiles = (rows: Row[]): DriverProfile[] =>
  // Start chaining operations on the array of rows.
  rows
    // For every single row, transform it into a 'DriverProfile' object.
    .map((row) => {
      // Find the driver's name/code, convert it to a string, or use an empty string if it's missing.
      const code = String(getValue(row, ['driver', 'driver code', 'code']) ?? '')
        // Remove extra spaces from the name.
        .trim()
        // Convert the name to ALL CAPS for consistency.
        .toUpperCase()

      // Return a new object representing this specific driver's stats.
      return {
        // Set the driver's code (name).
        code,
        // Find their fast lap time ("push pace"), and convert it to seconds.
        pushPaceSec: parseDurationToSec(getValue(row, ['push pace', 'pushpace', 'push_pace', 'push'])),
        // Find their fuel-saving lap time ("lico pace" / Lift and Coast), and convert it to seconds.
        licoPaceSec: parseDurationToSec(getValue(row, ['lico pace', 'lico+1 pace', 'licopace', 'lico'])),
        // Find how much fuel they use when pushing, safely converting it to a number.
        pushFuelUsageLiters: toNumber(
          // Look for headers related to push fuel.
          getValue(row, ['push fuel usage', 'push fuel', 'pushfuelusage']),
          // Default to 0 if not found.
          0
        // Close the toNumber function.
        ),
        // Find how much fuel they use when saving fuel, safely converting it to a number.
        licoFuelUsageLiters: toNumber(
          // Look for headers related to lift and coast fuel.
          getValue(row, ['lico fuel usage', 'lico fuel', 'licofuelusage']),
          // Default to 0 if not found.
          0
        // Close the toNumber function.
        ),
      // Close the returned driver object.
      }
    // Close the map function.
    })
    // After creating all driver objects, filter out any invalid ones to ensure data quality.
    .filter((driver) =>
      // Keep the driver ONLY IF they have a name...
      driver.code &&
      // AND their push lap time is greater than 0...
      driver.pushPaceSec > 0 &&
      // AND their fuel saving lap time is greater than 0...
      driver.licoPaceSec > 0 &&
      // AND their push fuel usage is not negative...
      driver.pushFuelUsageLiters >= 0 &&
      // AND their fuel saving usage is not negative.
      driver.licoFuelUsageLiters >= 0
    // Close the filter function.
    )

// Create a function 'parseRaceConfig' that reads the global race settings from the CSV.
const parseRaceConfig = (rows: Row[]): { raceDurationSec: number; pitRules: PitRules } => {
  // Grab the very first row of data, as race settings usually only need one row.
  const firstRow = rows[0]
  // If the file was completely empty (no first row)...
  if (!firstRow) {
    // ...return a default set of race rules to prevent the app from crashing.
    return {
      // Set default race duration.
      raceDurationSec: DEFAULT_RACE_DURATION_SEC,
      // Set default pit stop rules.
      pitRules: {
        // Base time spent driving down the pitlane.
        pitlaneBaselineSec: 20,
        // Time it takes to put one liter of fuel in the car.
        refuelTimeSecPerLiter: 0,
        // Time it takes to change the tyres.
        tyreChangeTimeSec: 12,
        // Number of fresh tyre sets available at the start.
        initialTyres: 60,
      // Close pitRules object.
      },
    // Close the returned default object.
    }
  // Close the if statement.
  }

  // If data exists, return an object containing the specific rules found in the CSV.
  return {
    // Get the race duration, ensuring it is at least 1 second long using Math.max.
    raceDurationSec: Math.max(
      // Look for duration headers and convert to seconds.
      parseDurationToSec(getValue(firstRow, ['race duration', 'duration'])),
      // Minimum value is 1.
      1
    // Close Math.max.
    ),
    // Define the custom pit rules based on the CSV data.
    pitRules: {
      // Get the pitlane time, defaulting to 20 if missing, and ensuring it doesn't go below 0.
      pitlaneBaselineSec: Math.max(toNumber(getValue(firstRow, ['pitlane time']), 20), 0),
      // Get the refuel speed, defaulting to 0, ensuring it doesn't go below 0.
      refuelTimeSecPerLiter: Math.max(toNumber(getValue(firstRow, ['refuel time']), 0), 0),
      // Get the tyre change time, defaulting to 12, ensuring it doesn't go below 0.
      tyreChangeTimeSec: Math.max(toNumber(getValue(firstRow, ['tyre change time']), 12), 0),
      // Get the total starting tyres available, defaulting to 60, ensuring it doesn't go below 0.
      initialTyres: Math.max(toNumber(getValue(firstRow, ['total new tyres', 'tyres']), 60), 0),
    // Close pitRules object.
    },
  // Close the returned object.
  }
// Close the 'parseRaceConfig' function.
}

// Create a function 'buildStintMatrix' that generates every possible driving scenario (stint) for each driver.
const buildStintMatrix = (drivers: DriverProfile[]): StintOption[] => {
  // Loop through every driver. 'flatMap' merges all the resulting scenarios into one flat list.
  return drivers.flatMap((driver, driverIndex) => {
    
    // Define the 4 distinct ways a driver can drive a stint in this race.
    const stintOptions: Array<{ mode: StintMode; paceSec: number; fuelLiters: number; doubleStinted: boolean }> = [
      // Scenario 1: Pushing hard on fresh tyres.
      { mode: 'Push', paceSec: driver.pushPaceSec, fuelLiters: driver.pushFuelUsageLiters, doubleStinted: false },
      
      // Scenario 2: Saving fuel (Lift and Coast) on fresh tyres.
      { mode: 'LiCo +1', paceSec: driver.licoPaceSec, fuelLiters: driver.licoFuelUsageLiters, doubleStinted: false },
      
      // Scenario 3: Pushing hard, but keeping the old tyres on (which slows them down by 1.5%).
      { mode: 'Used Tyre Push', paceSec: driver.pushPaceSec * 1.015, fuelLiters: driver.pushFuelUsageLiters, doubleStinted: true },
      
      // Scenario 4: Saving fuel, but keeping the old tyres on (which slows them down by 1.5%).
      { mode: 'Used Tyre Lico + 1', paceSec: driver.licoPaceSec * 1.015, fuelLiters: driver.licoFuelUsageLiters, doubleStinted: true },
    ]

    // Loop through the 4 scenarios we just created for this specific driver.
    return stintOptions.map((stint, stintIndex) => {
      // Return a fully detailed 'StintOption' object that the app's calculator can use.
      return {
        // Create a unique ID for this stint combining the driver's code, the driving mode, and index numbers.
        id: `${driver.code}-${stint.mode}-${driverIndex}-${stintIndex}`,
        // Note which driver is doing this stint.
        driverCode: driver.code,
        // Note the driving style (Push, LiCo, Used Tyre Push, Used Tyre Lico + 1).
        mode: stint.mode,
        // Set how long one lap takes in this scenario.
        durationSec: stint.paceSec,
        // Default to 1 lap (this will likely be multiplied by the calculator later).
        laps: 1,
        // Determine tyre usage: If double stinting, they use 0 new sets. Otherwise, they use 1 new set.
        tyresUsed: stint.doubleStinted ? 0 : 1,
        // Set the fuel consumed per lap in this scenario.
        fuelLiters: stint.fuelLiters,
      }
    })
  })
}
// Create a function 'resolveModelFromRows' that takes the raw data from both files and builds the final application data structure.
const resolveModelFromRows = (driverRows: Row[], raceRows: Row[]): RaceModel => {
  // Check the driver file to guarantee it has all the mandatory columns; crash with an error if it doesn't.
  requireHeaders(
    driverRows,
    ['driver', 'push pace', 'lico pace', 'push fuel usage', 'lico fuel usage'],
    'Driver CSV'
  )
  // Check the race settings file to guarantee it has its mandatory columns.
  requireHeaders(
    raceRows,
    ['total new tyres', 'race duration', 'pitlane time', 'refuel time', 'tyre change time'],
    'Race CSV'
  )

  // Use our previous function to turn the raw rows into structured Driver objects.
  const driverProfiles = parseDriverProfiles(driverRows)
  // Use our previous function to extract the race rules from the raw rows.
  const { raceDurationSec, pitRules } = parseRaceConfig(raceRows)
  // Use our previous function to calculate every possible driving scenario based on the drivers we found.
  const stintMatrix = buildStintMatrix(driverProfiles)

  // Check if we ended up with zero valid drivers...
  if (driverProfiles.length === 0) {
    // ...if so, stop everything and show an error.
    throw new Error('No valid driver profiles found.')
  }

  // Check if no driving scenarios were generated (which would break the calculator)...
  if (stintMatrix.length === 0) {
    // ...if so, stop everything and show an error.
    throw new Error('No valid stint options could be generated from the driver list.')
  }

  // --- NEW FEATURE: Calculate the average LiCo +1 lap time ---
  // 1. We use the 'reduce' function to add up the 'licoPaceSec' for every driver in the list.
  const totalLicoPace = driverProfiles.reduce((sum, driver) => sum + driver.licoPaceSec, 0)
  // 2. We divide the total by the number of drivers to get the exact average.
  const averageLicoPaceSec = totalLicoPace / driverProfiles.length

  // Assemble and return the final 'RaceModel' object containing everything the app needs to optimize the race.
  return {
    // Pass along the total race time.
    raceDurationSec,
    // Assign our newly calculated average LiCo pace to act as the default final lap allowance!
    finalLapAllowanceSec: averageLicoPaceSec,
    // Pass along the default limit for how long a driver can stay in the car.
    maxConsecutiveStintsPerDriver: DEFAULT_MAX_CONSECUTIVE_STINTS,
    // Pass along the list of active drivers.
    driverProfiles,
    // Pass along the matrix of all possible driving scenarios.
    stintMatrix,
    // Pass along the rules regarding pit stops.
    pitRules,
  }
}

// Create an 'ingestRaceConfiguration' function. The 'export' keyword means this function can be used by other files (like App.tsx).
export const ingestRaceConfiguration = async (
  // It expects the user to provide the file containing driver data...
  driverFile: File,
  // ...and the file containing the overall race data.
  raceFile: File
// It will return a Promise containing our complete, finalized RaceModel.
): Promise<RaceModel> => {
  // Check if either of the uploaded files does NOT end with the ".csv" extension.
  if (!driverFile.name.toLowerCase().endsWith('.csv') || !raceFile.name.toLowerCase().endsWith('.csv')) {
    // If they aren't CSVs, reject the files and throw an error.
    throw new Error('Both input files must be CSV files.')
  // Close the if statement.
  }

  // Wait for both files to be parsed simultaneously (for speed) and store the resulting rows in two separate variables.
  const [driverRows, raceRows] = await Promise.all([parseCsv(driverFile), parseCsv(raceFile)])
  // Take those parsed rows and feed them into our resolver function to build and return the final data model.
  return resolveModelFromRows(driverRows, raceRows)
// Close the 'ingestRaceConfiguration' function.
}

// Create a 'formatDuration' function (also exported for use elsewhere) that turns pure seconds back into a readable clock format.
export const formatDuration = (seconds: number): string => {
  // Make sure the seconds are rounded to a whole number and never drop below zero.
  const safe = Math.max(Math.round(seconds), 0)
  // Calculate the number of full hours by dividing by 3600 and dropping any decimals.
  const hours = Math.floor(safe / 3600)
  // Calculate the remaining minutes by taking the leftover seconds from the hour division, and dividing by 60.
  const minutes = Math.floor((safe % 3600) / 60)
  // Calculate the remaining seconds that don't fit into a full minute.
  const secs = safe % 60

  // If the total time is 1 hour or longer...
  if (hours > 0) {
    // ...return a format like "1:05:09", ensuring minutes and seconds always have 2 digits (padding with a zero if needed).
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  // Close the if statement.
  }

  // If the total time is less than an hour, return a format like "5:09", keeping 2 digits for seconds.
  return `${minutes}:${String(secs).padStart(2, '0')}`
// Close the 'formatDuration' function.
}
