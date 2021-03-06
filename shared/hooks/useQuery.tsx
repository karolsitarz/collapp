import { useFilters } from 'shared/hooks/useFilters'
import useSWR, { SWRConfiguration } from 'swr'
import { generateKey } from 'shared/utils/object'

interface Options extends SWRConfiguration {
  ignoreFilters?: boolean
}

export const useQuery = (
  key: string[] | string | false,
  path: string,
  options?: Options,
) => {
  const [_filters] = useFilters()
  const filters = options?.ignoreFilters ? {} : _filters
  const filteredSearch = Object.entries(filters).reduce(
    (acc, [key, value]) => (value == null ? acc : { ...acc, [key]: value }),
    {},
  )
  const search = new URLSearchParams(filteredSearch)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return useSWR(
    key ? generateKey(key, filters) : null,
    () =>
      fetch(`${origin}${path}?` + search).then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          const error = new Error('An error ocurred. Please try again later.')
          error.data = data
          throw error
        }
        return data
      }),
    options,
  )
}
