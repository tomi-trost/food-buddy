import { useState } from 'react'
import { savePhotosOn, setSavePhotos } from '../lib/originals'

/** Settings → Photos (this phone only): keep camera photos so the check screen can save them to
 *  Photos. Off by default, so nobody gets the extra button who doesn't want it. */
export function PhotoSettings() {
  const [on, setOn] = useState(savePhotosOn)
  const toggle = () => {
    setSavePhotos(!on)
    setOn(!on)
  }
  return (
    <>
      <h2>Photos</h2>
      <div className="card">
        <div className="row">
          <div className="sp">
            <h3>Save my photos to Photos</h3>
            <div className="sub">On this phone. Adds “Save photo to Photos” to the check screen for photos taken in the app.</div>
          </div>
          <button className={`chip${on ? ' on' : ''}`} aria-pressed={on} aria-label="Save my photos to Photos" onClick={toggle}>
            {on ? 'On' : 'Off'}
          </button>
        </div>
        {on && (
          <details style={{ marginTop: 10 }}>
            <summary>Into a “Food Buddy” album (iPhone, once)</summary>
            <ol className="sub" style={{ paddingLeft: 18, lineHeight: 1.5 }}>
              <li>In Photos, make an album called Food Buddy.</li>
              <li>In Shortcuts, tap + and add the action “Save to Photo Album”. Set the album to Food Buddy.</li>
              <li>Tap ⓘ, switch on “Show in Share Sheet” and allow Images only. Name it “Save to Food Buddy”.</li>
              <li>In the app, tap “Save photo to Photos”, then “Save to Food Buddy” in the share sheet.</li>
            </ol>
            <div className="sub">Without the Shortcut, “Save Image” puts it in Recents. Photos you don’t save are deleted from the app after 3 days.</div>
          </details>
        )}
      </div>
    </>
  )
}
