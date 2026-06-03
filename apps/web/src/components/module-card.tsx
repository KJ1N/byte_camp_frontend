interface ModuleCardProps {
  title: string;
  description: string;
  items: string[];
}

export function ModuleCard({ title, description, items }: ModuleCardProps) {
  return (
    <article className="rounded-lg border border-[#e0e5ee] bg-white p-5">
      <h3 className="mt-0 text-lg font-bold">{title}</h3>
      <p className="m-0 leading-7 text-[#5f6d83]">{description}</p>
      <ul className="mt-4 list-disc pl-5 leading-8 text-[#344154]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
