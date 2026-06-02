interface StatusCardProps {
  label: string;
  value: string;
  description: string;
}

export function StatusCard({ label, value, description }: StatusCardProps) {
  return (
    <section className="status-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{description}</span>
    </section>
  );
}

