import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { dropOriginal, getOriginal, savePhotosOn, shareOriginal } from '../lib/originals'
import { Icon } from '../ui/Icon'

/** "Save photo to Photos": only when switched on in Settings and the camera's original is still
 *  on this phone. The share sheet saves it ("Save Image", or our Food Buddy Shortcut). */
export function SaveOriginal({ analysisId }: { analysisId: number }) {
  const qc = useQueryClient()
  const on = savePhotosOn()
  const original = useQuery({ queryKey: ['original', analysisId], queryFn: () => getOriginal(analysisId), enabled: on, staleTime: Infinity })
  const [failed, setFailed] = useState(false)
  if (!on || !original.data) return null
  const save = async () => {
    if (await shareOriginal(original.data!)) {
      await dropOriginal(analysisId)
      qc.setQueryData(['original', analysisId], null)
    } else setFailed(true)
  }
  return (
    <>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={save}>
        <Icon name="image" size={18} /> Save photo to Photos
      </button>
      {failed && <p className="sub">Not saved. Try again, and pick “Save to Food Buddy” or “Save Image” in the share sheet.</p>}
    </>
  )
}
