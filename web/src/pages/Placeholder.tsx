/** Temporary screen for tabs whose section isn't built yet (see docs/execution-plan.md). */
export function Placeholder({ title, section }: { title: string; section: string }) {
  return (
    <>
      <div className="top"><h1>{title}</h1></div>
      <div className="card sub">Coming in {section}.</div>
    </>
  )
}
