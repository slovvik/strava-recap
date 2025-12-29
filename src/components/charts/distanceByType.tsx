import { useMemo } from "react"
import { SportType } from "../../types/strava"
import { unitConversion } from "../../utils/utils"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from "recharts"
import { TrendingUp } from 'lucide-react'
import Card from "../common/card"
import { ActivitiesByType, UnitDefinitions } from "../../types/activity"
import NoData from "../common/noData"
import { useStravaActivityContext } from "../../hooks/useStravaActivityContext"
import { useThemeContext } from "../../hooks/useThemeContext"
import * as Sentry from "@sentry/browser"


type DistanceByTypeData = {
  sportType: string
  distance: number
}

export const calculateDistanceByType = (byTypeData: ActivitiesByType): { chartData: DistanceByTypeData[], total: number } => {
  const res = Object.entries(byTypeData).reduce((acc, [sportType, activities]) => {
    const totalDistance = activities.reduce((sum, act) => {
      if (!act.distance || act.distance < 10) return sum
      return Number((sum + act.distance).toFixed(2))
    }, 0)

    if (totalDistance > 0) {
      acc.chartData.push({
        sportType: sportType,
        distance: totalDistance
      })
      acc.total = Number((acc.total + totalDistance).toFixed(2))
    }
    return acc
  }, { chartData: [] as DistanceByTypeData[], total: 0 })

  // Sort by distance descending
  res.chartData.sort((a, b) => b.distance - a.distance)

  return res.total > 0 ? res : { chartData: [], total: 0 }
}


/*
 * Total distance per activity type
*/
export default function DistanceByType() {
  const { activitiesData, units } = useStravaActivityContext()
  const { darkMode, colorPalette } = useThemeContext()

  const rawData = useMemo(() => {
    if (!activitiesData.byType) {
      return { data: [], totalDistance: 0 }
    }
    try {
      const { chartData, total } = calculateDistanceByType(activitiesData.byType)
      return { data: chartData, totalDistance: total }
    } catch (err) {
      console.warn(err)
      Sentry.captureException(err)
      return { data: [], totalDistance: 0 }
    }
  }, [activitiesData])

  const { data, totalDistance } = useMemo(() => {
    const convertedChartData = rawData.data.map(item => ({
      ...item,
      distance: Number(unitConversion.convertDistance(item.distance, units).toFixed(2))
    }))
    const convertedTotal = Number(unitConversion.convertDistance(rawData.totalDistance, units).toFixed(2))
    return {
      data: convertedChartData,
      totalDistance: convertedTotal
    }
  }, [rawData, units])

  if (totalDistance === 0) {
    return (
      <Card
        title="Distance by Activity"
        description="total distance per activity type"
        icon={<TrendingUp size={16} strokeWidth={2} />}
      >
        <NoData />
      </Card>
    )
  }

  return (
    <Card
      title="Distance by Activity"
      description="total distance per activity type"
      total={Math.round(totalDistance)}
      totalUnits={UnitDefinitions[units].distance}
      icon={<TrendingUp size={16} strokeWidth={2} />}
    >
      <ResponsiveContainer
        height={350}
        width="90%"
      >
        <BarChart data={data}>
          <Tooltip
            cursor={{ opacity: 0.8, fill: darkMode ? "#1a1a1a" : "#cbd5e1" }}
            contentStyle={{
              backgroundColor: darkMode ? "#1f1f1f" : "#fff",
              border: `1px solid ${darkMode ? "#333" : "#ccc"}`,
              borderRadius: "4px"
            }}
            labelStyle={{ color: darkMode ? "#fff" : "#000" }}
            formatter={(value: number) => [
              `${value.toFixed(2)} ${UnitDefinitions[units].distance}`,
              "Distance"
            ]}
          />
          <XAxis
            type="category"
            dataKey="sportType"
            tick={{
              fontSize: 12,
              fill: darkMode ? "#c2c2c2" : "#666"
            }}
            stroke={darkMode ? "#c2c2c2" : "#666"}
          />
          <YAxis
            tick={{
              fontSize: 12,
              fill: darkMode ? "#c2c2c2" : "#666"
            }}
            stroke={darkMode ? "#c2c2c2" : "#666"}
          />
          <Bar
            radius={[4, 4, 0, 0]}
            dataKey="distance"
            label={{
              position: "top",
              fontSize: 10,
              fill: darkMode ? "#c2c2c2" : "#666",
              formatter: (value: number) => value > 0 ? Number(value).toFixed(0) : ''
            }}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell
                key={entry.sportType}
                fill={colorPalette[entry.sportType as SportType] || "#8884d8"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}