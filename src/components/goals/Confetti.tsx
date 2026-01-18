import ConfettiExplosion from "react-confetti-explosion";

export function Confetti() {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50">
      <ConfettiExplosion
        force={1.2}
        duration={4000}
        particleCount={250}
        width={1800}
        height="200vh"
        colors={[
          '#22c55e', // green
          '#3b82f6', // blue
          '#f97316', // orange
          '#a855f7', // purple
          '#ec4899', // pink
          '#eab308', // yellow
          '#14b8a6', // teal
        ]}
      />
    </div>
  );
}
