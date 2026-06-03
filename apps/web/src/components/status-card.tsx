interface StatusCardProps {
  label: string;
  value: string;
  description: string;
}

export function StatusCard({ label, value, description }: StatusCardProps) {
  return (
    <section className="rounded-lg border border-[#e0e5ee] bg-white p-5">
      <p className="m-0 leading-7 text-[#5f6d83]">{label}</p>
      <strong className="my-2 block text-[28px]">{value}</strong>
      <span className="m-0 leading-7 text-[#5f6d83]">{description}</span>
    </section>
  );
}
