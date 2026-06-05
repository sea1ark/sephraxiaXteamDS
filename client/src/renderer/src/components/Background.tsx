// Floating blurred colour orbs behind the entire UI.
export function Background() {
  return (
    <>
      <div
        className="orb"
        style={{ width: 380, height: 380, top: -80, left: -60, background: '#5d3a8c', opacity: 0.3 }}
      />
      <div
        className="orb"
        style={{ width: 320, height: 320, bottom: -90, right: 120, background: '#8c2f55', opacity: 0.28 }}
      />
      <div
        className="orb"
        style={{ width: 300, height: 300, top: '40%', right: -80, background: '#3a4a8c', opacity: 0.25 }}
      />
    </>
  );
}
