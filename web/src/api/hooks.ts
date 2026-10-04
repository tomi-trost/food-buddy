import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 })

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.updateMe, onSuccess: (me) => qc.setQueryData(['me'], me) })
}

export function useUpdateHousehold() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.updateHousehold, onSuccess: (me) => qc.setQueryData(['me'], me) })
}
