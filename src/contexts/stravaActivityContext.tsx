import { useQuery } from "@tanstack/react-query"
import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import { stravaApi } from "../services/api"
import { ActivitiesByMonth, ActivitiesByType, ActivityData, Month, MONTHS, UnitDefinitions, Units } from "../types/activity"
import { SportType, StravaActivity, StravaAthleteZones, StravaPhoto } from "../types/strava"
import { useStravaAuthContext } from "../hooks/useStravaAuthContext"
import { useCurrentYearContext } from "../hooks/useCurrentYearContext"
import { useThemeContext } from "../hooks/useThemeContext"
import { generateColorPalette, storage } from "../utils/utils"
import * as Sentry from "@sentry/browser"
import { track } from "@vercel/analytics"


export const createEmptyMonthlyActivities = () => {
  return MONTHS.reduce((acc, month) => {
    acc[month] = []
    return acc
  }, {} as ActivitiesByMonth)
}


interface StravaActivityContextType {
  activitiesData: ActivityData
  activitiesLoading: boolean
  activitiesError: Error | null
  activitiesFromCache: boolean
  retryFetchActivities: () => void
  athleteZonesData: StravaAthleteZones | undefined
  athleteZonesLoading: boolean
  athleteZonesError: Error | null
  units: Units
  filters: SportType[]
  availableSports: SportType[]
  photosData: StravaPhoto[] | undefined
  photosLoading: boolean
  photosError: Error | null
  komData: Map<number, number>
  komDataLoading: boolean
  komDataProgress: { current: number, total: number }
  komDataPaused: boolean
  pauseReason: string | null
  refreshKomData: () => void
  resumeKomFetch: () => void
  setUnits: (units: Units) => void
  setFilters: React.Dispatch<React.SetStateAction<SportType[]>>
}

export const StravaActivityContext = createContext<StravaActivityContextType>(
  {
    activitiesData: {
      all: [],
      byMonth: createEmptyMonthlyActivities(),
      byType: {}
    },
    activitiesLoading: false,
    activitiesError: null,
    activitiesFromCache: false,
    retryFetchActivities: () => { },
    athleteZonesData: undefined,
    athleteZonesLoading: false,
    athleteZonesError: null,
    units: "imperial",
    filters: [],
    availableSports: [],
    photosData: undefined,
    photosLoading: false,
    photosError: null,
    komData: new Map(),
    komDataLoading: false,
    komDataProgress: { current: 0, total: 0 },
    komDataPaused: false,
    pauseReason: null,
    refreshKomData: () => { },
    resumeKomFetch: () => { },
    setUnits: () => { },
    setFilters: () => { }
  }
)


export const processActivities = (allActivities: StravaActivity[], filters: SportType[]) => {
  const activitiesByMonth: ActivitiesByMonth = createEmptyMonthlyActivities()
  const activitiesByType: ActivitiesByType = {}
  const activitiesWithPhotos: StravaActivity[] = []
  const allSports: Set<SportType> = new Set()

  const filteredActivities = allActivities.reduce((acc, act) => {
    if (!act.sport_type || !act.start_date || isNaN(new Date(act.start_date).getTime())) {
      console.warn("Skipping activity with missing/invalid sport_type or start_date: ", act)
      Sentry.captureException("Skipping activity with missing/invalid sport_type or start_date")
      return acc
    }
    const sportType = act.sport_type as SportType

    allSports.add(sportType)

    if (filters.length > 0 && !filters.includes(act.sport_type as SportType)) {
      return acc
    }

    // add to sport type
    if (!activitiesByType[sportType]) {
      activitiesByType[sportType] = [act]
    } else {
      activitiesByType[sportType].push(act)
    }

    // add to month
    const activityMonth = new Date(act.start_date).toLocaleString("default", { month: "long" }) as Month
    activitiesByMonth[activityMonth].push(act)

    // add to photo
    if (act.total_photo_count && act.total_photo_count > 0) {
      activitiesWithPhotos.push(act)
    }

    acc.push(act)
    return acc
  }, [] as StravaActivity[])

  return {
    all: filteredActivities,
    allSports: Array.from(allSports),
    byMonth: activitiesByMonth,
    byType: activitiesByType,
    withPhotos: activitiesWithPhotos
  }
}


export default function StravaActivityContextProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken } = useStravaAuthContext()
  const { currentYear } = useCurrentYearContext()
  const { theme, colorPalette, setColorPalette } = useThemeContext()

  const storedUnits = storage.get("units", "imperial" as Units)
  const [units, setUnits] = useState<Units>(
    Object.keys(UnitDefinitions).includes(storedUnits as string)
      ? storedUnits as Units
      : "metric"
  )
  const [filters, setFilters] = useState<SportType[]>([])
  const [availableSports, setAvailableSports] = useState<SportType[]>([])
  const [activityPhoto, setActivityPhoto] = useState<StravaActivity | undefined>()
  const [komData, setKomData] = useState<Map<number, number>>(new Map())
  const [komDataLoading, setKomDataLoading] = useState<boolean>(false)
  const [komDataProgress, setKomDataProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 })
  const [komDataPaused, setKomDataPaused] = useState<boolean>(false)
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [remainingActivities, setRemainingActivities] = useState<StravaActivity[]>([])
  const [activitiesFromCache, setActivitiesFromCache] = useState<boolean>(false)

  const {
    data: allActivityData,
    isLoading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities
  } = useQuery({
    queryKey: [currentYear],
    queryFn: async () => {
      try {
        const data = await stravaApi.getAllActivities(accessToken!, currentYear)

        // Cache successful fetch
        storage.set(`activities_cache_${currentYear}`, data)
        setActivitiesFromCache(false)

        return data
      } catch (err: any) {
        // On 429, load from cache instead of throwing
        if (err.message && err.message.includes('429')) {
          console.warn('Rate limited - loading cached activities')
          const cached = storage.get<StravaActivity[]>(`activities_cache_${currentYear}`, [])
          if (cached && cached.length > 0) {
            setActivitiesFromCache(true)
            return cached
          }
        }
        throw err
      }
    },
    enabled: isAuthenticated && !!accessToken,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  })

  const {
    data: athleteZonesData,
    isLoading: athleteZonesLoading,
    error: athleteZonesError,
  } = useQuery({
    queryKey: ["athleteZones"],
    queryFn: () => stravaApi.getAthleteZones(accessToken!),
    enabled: isAuthenticated && !!accessToken,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false
  })

  const {
    data: photosData,
    isLoading: photosLoading,
    error: photosError
  } = useQuery({
    queryKey: ["activityPhotos", activityPhoto],
    queryFn: () => stravaApi.getActivityPhotos(accessToken!, activityPhoto!.id),
    enabled: isAuthenticated && !!accessToken && !!activityPhoto,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  })

  const activitiesData = useMemo(() => {
    if (!allActivityData || allActivityData.length === 0) {
      return {
        all: [],
        byMonth: createEmptyMonthlyActivities(),
        byType: {}
      } as ActivityData
    }
    try {
      const { all, byMonth, byType, withPhotos, allSports } = processActivities(allActivityData, filters)
      setAvailableSports(allSports)
      if (withPhotos.length > 0) {
        const actWithPhoto = withPhotos[Math.floor(Math.random() * withPhotos.length)]
        setActivityPhoto(actWithPhoto)
      }
      track("successfully processed activities", {
        currentYear: currentYear,
        numActivities: all.length,
        numSports: allSports.length
      })
      return { all, byMonth, byType }
    } catch (err) {
      console.warn("Error processing activities data")
      Sentry.captureException(err)
      return {
        all: [],
        byMonth: createEmptyMonthlyActivities(),
        byType: {}
      } as ActivityData
    }
  }, [allActivityData, filters])

  useEffect(() => {
    if (Object.keys(activitiesData.byType).length === 0) {
      return
    }
    const sportTypes = Object.keys(activitiesData.byType) as SportType[]
    setColorPalette(generateColorPalette(sportTypes, theme, colorPalette, false))
  }, [activitiesData])

  useEffect(() => {
    if (Object.keys(activitiesData.byType).length === 0) {
      return
    }
    try {
      const sportTypes = Object.keys(activitiesData.byType) as SportType[]
      setColorPalette(generateColorPalette(sportTypes, theme, colorPalette, true))
    } catch (err) {
      console.warn("Error setting color palette")
      Sentry.captureException(err)
    }
  }, [theme])

  useEffect(() => {
    setFilters([])
  }, [currentYear])

  const fetchKomData = useCallback(async (activities: StravaActivity[], resumeMode: boolean = false) => {
    if (!accessToken) return

    // Reset pause state
    setKomDataPaused(false)
    setPauseReason(null)

    setKomDataLoading(true)

    // Check cache first
    const cacheKey = `kom_cache_${currentYear}`
    const cached = storage.get<Record<number, number>>(cacheKey, {})
    const komCounts = new Map<number, number>(
      Object.entries(cached).map(([k, v]) => [parseInt(k), v])
    )

    // IMMEDIATE DISPLAY: Set cached data right away
    if (komCounts.size > 0) {
      setKomData(new Map(komCounts))
    }

    // Determine which activities to fetch
    const activitiesWithAchievements = resumeMode
      ? remainingActivities
      : activities.filter(a => a.achievement_count && a.achievement_count > 0)

    // Filter out already cached activities
    const activitiesToFetch = activitiesWithAchievements.filter(
      a => !komCounts.has(a.id)
    )

    // If everything is cached, we're done!
    if (activitiesToFetch.length === 0) {
      setKomDataLoading(false)
      setRemainingActivities([])
      return
    }

    setKomDataProgress({
      current: activitiesWithAchievements.length - activitiesToFetch.length,
      total: activitiesWithAchievements.length
    })

    let processed = activitiesWithAchievements.length - activitiesToFetch.length

    for (const activity of activitiesToFetch) {
      try {
        const details = await stravaApi.getActivityDetails(accessToken, activity.id)
        const koms = details.segment_efforts?.filter(e => e.kom_rank === 1).length || 0
        komCounts.set(activity.id, koms)

        // REAL-TIME UPDATE: Update chart immediately after each fetch
        setKomData(new Map(komCounts))

        // Save to cache incrementally
        storage.set(cacheKey, Object.fromEntries(komCounts))

        // Rate limit protection: 150ms between requests
        await new Promise(resolve => setTimeout(resolve, 150))
      } catch (err: any) {
        console.error(`Error fetching activity ${activity.id}:`, err)

        // PAUSE ON RATE LIMIT: Stop and let user resume manually
        if (err.message && err.message.includes('429')) {
          console.warn('Rate limited - pausing fetch')

          // Save unfetched activities
          const currentIndex = activitiesToFetch.indexOf(activity)
          setRemainingActivities(activitiesToFetch.slice(currentIndex))

          // Set pause state
          setKomDataPaused(true)
          setPauseReason('Rate limited (429) - Click "Continue" to resume')
          setKomDataLoading(false)
          return  // Exit function
        }

        // Set 0 for other errors to avoid re-trying
        komCounts.set(activity.id, 0)
        setKomData(new Map(komCounts))
        storage.set(cacheKey, Object.fromEntries(komCounts))
      }

      processed++
      setKomDataProgress({ current: processed, total: activitiesWithAchievements.length })
    }

    // All done!
    setKomDataLoading(false)
    setRemainingActivities([])
  }, [accessToken, currentYear, remainingActivities])

  const resumeKomFetch = useCallback(() => {
    if (remainingActivities.length > 0 && activitiesData) {
      fetchKomData(activitiesData.all, true)  // resumeMode = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingActivities, activitiesData])

  useEffect(() => {
    if (activitiesData && activitiesData.all.length > 0 && !komDataLoading) {
      fetchKomData(activitiesData.all)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesData])

  const updateUnits = (unit: Units) => {
    setUnits(unit)
    storage.set<string>("units", unit)
    track("changed unit", {
      unit: unit
    })
  }

  return (
    <StravaActivityContext.Provider
      value={{
        activitiesData,
        activitiesLoading,
        activitiesError,
        activitiesFromCache,
        retryFetchActivities: () => {
          setActivitiesFromCache(false)
          refetchActivities()
        },
        athleteZonesData,
        athleteZonesLoading,
        athleteZonesError,
        units,
        filters,
        availableSports,
        photosData,
        photosLoading,
        photosError,
        komData,
        komDataLoading,
        komDataProgress,
        komDataPaused,
        pauseReason,
        refreshKomData: () => fetchKomData(activitiesData.all),
        resumeKomFetch,
        setUnits: updateUnits,
        setFilters
      }}
    >
      {children}
    </StravaActivityContext.Provider>
  )

}