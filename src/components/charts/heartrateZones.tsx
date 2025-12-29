import { useMemo } from "react"
import Card from "../common/card"
import { Activity } from "lucide-react"
import { useStravaActivityContext } from "../../hooks/useStravaActivityContext"
import NoData from "../common/noData"
import { useThemeContext } from "../../hooks/useThemeContext"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
  Tooltip
} from "recharts"
import { SportType, Zone, StravaAthleteZones } from "../../types/strava"
import { unitConversion } from "../../utils/utils"
import { ActivityData } from "../../types/activity"
import * as Sentry from "@sentry/browser"


type RadialChartData = {
  zone: Zone
  zoneName: string
} & Record<SportType, number>

type TooltipProps = {
  active?: boolean
  payload?: any[]
}

export const calculateHeartrateZones = (
  data: ActivityData,
  athleteZonesData: StravaAthleteZones
): RadialChartData[] => {
  if (!data?.all || !data.byType || !athleteZonesData?.heart_rate) return []

  const sportTypes = Object.keys(data.byType)
  const sportsData = sportTypes.reduce((acc, sport) => {
    acc[sport as SportType] = 0
    return acc
  }, {} as Record<SportType, number>)

  const hrZones = athleteZonesData.heart_rate.zones
  const zones = hrZones.map((z, idx) => ({
    zoneName: `Zone ${idx + 1}`,
    zone: { min: z.min, max: z.max },
    ...sportsData
  }))

  let hasHrData = false
  data.all.forEach(act => {
    if (!act.average_heartrate || !act.moving_time || !act.sport_type) return

    const avgHr = act.average_heartrate
    const movingTime = Number(unitConversion.convertTime(act.moving_time, "hours").toFixed(2))
    const zone = zones.find(item => avgHr >= item.zone.min && avgHr < item.zone.max)

    if (zone) {
      zone[act.sport_type as SportType] += movingTime
      hasHrData = true
    }
  })

  return hasHrData ? zones : []
}

const CustomBarTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload) return null

  const zoneName = payload[0].payload.zoneName ?? ""
  return (
    <div className="bg-white dark:bg-black bg-opacity-90 p-2 rounded flex-col space-y-2">
      <p className="font-bold">{zoneName}</p>
      <div className="flex flex-col gap-1">
        {payload.map((p: any, idx: number) => {
          const value = p.payload[p.dataKey]
          if (value === 0) return null

          return (
            <p key={idx} style={{ color: p.color }}>
              {p.name}: <span className="font-semibold">{Number(value.toFixed(2))}h</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}

/*
 * Total minutes spent in each heartrate zone
 */
export default function HeartrateZones() {
  const { athleteZonesData, activitiesData } = useStravaActivityContext()
  const { darkMode, colorPalette } = useThemeContext()

  const data = useMemo(() => {
    if (!activitiesData || !athleteZonesData) return []

    try {
      return calculateHeartrateZones(activitiesData, athleteZonesData)
    } catch (err) {
      console.warn(err)
      Sentry.captureException(err)
      return []
    }
  }, [activitiesData, athleteZonesData])

  const chartConfig = useMemo(() => ({
    xAxisStyle: {
      fontSize: 12,
      fill: darkMode ? "#c2c2c2" : "#666"
    },
    yAxisStyle: {
      fontSize: 12,
      fill: darkMode ? "#c2c2c2" : "#666"
    },
    tooltipStyle: {
      cursor: {
        opacity: 0.8,
        fill: darkMode ? "#1a1a1a" : "#cbd5e1"
      }
    }
  }), [darkMode])

  if (data.length === 0) {
    return (
      <Card
        title="Heartrate Zones"
        description="total minutes spent in each zone"
        icon={<Activity size={16} strokeWidth={2} />}
      >
        <NoData />
      </Card>
    )
  }

  return (
    <Card
      title="Heartrate Zones"
      description="total hours spent in each zone"
      icon={<Activity size={16} strokeWidth={2} />}
    >
      <ResponsiveContainer height={350} width="90%">
        <BarChart data={data}>
          <XAxis
            type="category"
            dataKey="zoneName"
            tick={chartConfig.xAxisStyle}
            stroke={darkMode ? "#c2c2c2" : "#666"}
          />
          <YAxis
            tick={chartConfig.yAxisStyle}
            stroke={darkMode ? "#c2c2c2" : "#666"}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fill: darkMode ? "#c2c2c2" : "#666" } }}
          />
          <Tooltip
            content={CustomBarTooltip}
            cursor={chartConfig.tooltipStyle.cursor}
          />
          {activitiesData?.byType &&
            Object.keys(activitiesData.byType).map((sport, idx) => (
              <Bar
                key={`bar-${idx}`}
                radius={[4, 4, 4, 4]}
                stackId="stack"
                dataKey={sport}
                fill={colorPalette[sport as SportType]}
                label={{
                  position: "insideTop",
                  fontSize: 9,
                  fill: "#ffffff",
                  formatter: (value: number) => value > 0 ? Number(value).toFixed(1) : ''
                }}
                isAnimationActive={false}
              />
            ))}
          <Legend />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}