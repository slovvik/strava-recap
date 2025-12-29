import { useEffect, useState, createContext } from "react"


type CurrentYearContextType = {
  currentYear: number
  updateYear: (year: number) => void
}

export const CurrentYearContext = createContext<CurrentYearContextType>({
  currentYear: 0,
  updateYear: () => { }
})

type CurrentYearContextProviderProps = {
  children: React.ReactNode
}

export default function CurrentYearContextProvider({ children }: CurrentYearContextProviderProps) {
  const getYearFromPath = () => {
    const pathYear = Number(window.location.pathname.split("/")[1])
    const currentYearNow = new Date().getFullYear()

    // If parsing fails, returns NaN, 0, or invalid year, default to current year
    if (isNaN(pathYear) || pathYear === 0 || pathYear < 2000 || pathYear > currentYearNow) {
      return currentYearNow
    }
    return pathYear
  }

  const [currentYear, setCurrentYear] = useState<number>(getYearFromPath())

  // redirect to this year if no year was set in the url path or year is invalid
  useEffect(() => {
    const pathYear = Number(window.location.pathname.split("/")[1])
    const currentYearNow = new Date().getFullYear()

    if (
      window.location.pathname === "/" ||
      isNaN(pathYear) ||
      pathYear === 0 ||
      pathYear < 2000 ||
      pathYear > currentYearNow
    ) {
      updateYear(currentYearNow)
    }
  }, [])

  const updateYear = (year: number) => {
    setCurrentYear(year)
    window.history.pushState({}, "", `/${year}`)
  }

  return (
    <CurrentYearContext.Provider
      value={{
        currentYear,
        updateYear
      }}
    >
      {children}
    </CurrentYearContext.Provider>
  )
}