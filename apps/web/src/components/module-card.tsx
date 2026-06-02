interface ModuleCardProps {
  title: string;
  description: string;
  items: string[];
}

export function ModuleCard({ title, description, items }: ModuleCardProps) {
  return (
    <article className="module-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

