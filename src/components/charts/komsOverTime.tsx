import { useMemo } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { Crown, Play } from 'lucide-react'
import Card from "../common/card"
import { useStravaActivityContext } from "../../hooks/useStravaActivityContext"
import { useThemeContext } from "../../hooks/useThemeContext"
import { SportType } from "../../types/strava"
import { ActivityData, MONTHS } from "../../types/activity"
import * as Sentry from "@sentry/browser"


type AreaChartData = {
  month: string
  [key: string]: number | string
}

type TooltipProps = {
  active?: boolean
  payload?: any[]
  label?: string
}

export const calculateKomsOverTime = (
  data: ActivityData,
  komData: Map<number, number>
): { chartData: AreaChartData[], total: number } => {
  console.log('[calculateKomsOverTime] Input:', {
    hasByMonth: !!data?.byMonth,
    komDataSize: komData.size,
    sportTypes: Object.keys(data?.byType || {})
  })

  if (!data?.byMonth || komData.size === 0) {
    console.log('[calculateKomsOverTime] Early return - no data')
    return { chartData: [], total: 0 }
  }

  const sportTypes = Object.keys(data.byType)
  const monthsData: AreaChartData[] = MONTHS.map(month => ({
    month,
    ...Object.fromEntries(sportTypes.map(sport => [sport, 0]))
  }))

  const { chartData, totalKoms } = Object.entries(data.byMonth).reduce((acc, [month, activities]) => {
    if (!activities) return acc

    activities.forEach(act => {
      const koms = komData.get(act.id) || 0
      if (koms > 0 && act.sport_type) {
        const monthData = acc.chartData.find(item => item.month === month)
        if (monthData) {
          monthData[act.sport_type] = (monthData[act.sport_type] as number || 0) + koms
          acc.totalKoms += koms
        }
      }
    })

    return acc
  }, { chartData: monthsData, totalKoms: 0 })

  console.log('[calculateKomsOverTime] Output:', {
    totalKoms,
    willReturnEmptyArray: totalKoms <= 0,
    chartDataLength: chartData.length,
    chartDataSample: chartData[0],
    fullChartData: chartData
  })

  return totalKoms > 0 ? { chartData, total: totalKoms } : { chartData: [], total: 0 }
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload || !label) return null

  return (
    <div className="bg-white dark:bg-black bg-opacity-90 p-2 rounded flex-col space-y-2">
      <p className="font-bold">{label}</p>
      <div className="flex flex-col gap-1">
        {payload.map((p: any, idx: number) => {
          const value = p.payload[p.dataKey]
          if (value === 0) return null

          return (
            <p key={idx} style={{ color: p.color }}>
              {p.dataKey}: <span className="font-semibold">{value}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}

/*
 * KOMs achieved per month
 */
export default function KomsOverTime() {
  const {
    activitiesData,
    komData,
    komDataLoading,
    komDataProgress,
    komDataPaused,
    pauseReason,
    resumeKomFetch
  } = useStravaActivityContext()
  const { darkMode, colorPalette } = useThemeContext()

  const { data, totalKoms } = useMemo(() => {
    console.log('[KOM useMemo] Calculating...', {
      hasActivitiesData: !!activitiesData,
      komDataSize: komData.size,
      activitiesDataKeys: activitiesData ? Object.keys(activitiesData.byType) : []
    })

    if (!activitiesData || komData.size === 0) {
      console.log('[KOM useMemo] Early return - no data')
      return { data: [], totalKoms: 0 }
    }

    try {
      const { chartData, total } = calculateKomsOverTime(activitiesData, komData)
      console.log('[KOM useMemo] Result:', {
        chartDataLength: chartData.length,
        total,
        chartDataSample: chartData[0]
      })
      return { data: chartData, totalKoms: total }
    } catch (err) {
      console.warn('[KOM useMemo] Error:', err)
      Sentry.captureException(err)
      return { data: [], totalKoms: 0 }
    }
  }, [activitiesData, komData])

  console.log('[KOM Render]', {
    dataLength: data.length,
    totalKoms,
    komDataLoading,
    komDataPaused
  })

  // Always show the card with progress info
  return (
    <Card
      title="KOMs"
      description="king of the mountain achievements per month"
      total={totalKoms}
      totalUnits="koms"
      icon={<Crown size={16} strokeWidth={2.5} />}
    >
      <div className="w-full p-4">
        {/* Progress bar - only show when loading or paused */}
        {(komDataLoading || komDataPaused) && komDataProgress.total > 0 && (
          <div className="mb-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {komDataLoading ? 'Loading KOM data...' : 'Paused'}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {komDataProgress.current} / {komDataProgress.total} activities
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${(komDataProgress.current / komDataProgress.total) * 100}%`
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {Math.round((komDataProgress.current / komDataProgress.total) * 100)}% complete
              </span>
            </div>

            {/* Paused state with resume button */}
            {komDataPaused && (
              <div className="flex flex-col gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded mt-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
                  {pauseReason}
                </p>
                <button
                  onClick={resumeKomFetch}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
                >
                  <Play size={16} />
                  Continue Fetching
                </button>
              </div>
            )}
          </div>
        )}

        {/* Chart - always render if data exists */}
        {data.length > 0 && (
          <ResponsiveContainer height={300} width="100%">
            <AreaChart data={data}>
              {activitiesData?.byType &&
                Object.keys(activitiesData.byType).map(sport => {
                  console.log(`[KOM] Rendering Area for sport: ${sport}`, {
                    color: colorPalette[sport as SportType],
                    hasColorInPalette: !!(colorPalette[sport as SportType])
                  })
                  return (
                    <Area
                      key={sport}
                      type="step"
                      dataKey={sport}
                      stroke={colorPalette[sport as SportType]}
                      strokeWidth={3}
                      fill={colorPalette[sport as SportType]}
                      fillOpacity={0.3}
                      label={{
                        position: "top",
                        fontSize: 9,
                        color: darkMode ? "#c2c2c2" : "#666",
                        fill: darkMode ? "#c2c2c2" : "#666",
                        formatter: (value: any) => value > 0 ? value : ""
                      }}
                      isAnimationActive={false}
                    />
                  )
                })}
              <XAxis
                type="category"
                dataKey="month"
                interval="equidistantPreserveStart"
                tick={{
                  fontSize: 12,
                  color: darkMode ? "#c2c2c2" : "#666",
                  fill: darkMode ? "#c2c2c2" : "#666",
                }}
                stroke={darkMode ? "#c2c2c2" : "#666"}
              />
              <Tooltip content={CustomTooltip} />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Show placeholder only when no data and not loading */}
        {data.length === 0 && !komDataLoading && (
          <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            No KOM data available
          </div>
        )}
      </div>
    </Card>
  )
}
