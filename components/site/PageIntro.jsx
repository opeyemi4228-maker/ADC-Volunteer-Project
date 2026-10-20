/** Top of an inner page: title and one short lead, left-aligned on white. */
export default function PageIntro({ title, lead, children }) {
  return (
    <div className="container-page pb-8 pt-10 sm:pt-14">
      <h1 className="h-page max-w-3xl sm:text-[2.5rem] sm:leading-12">{title}</h1>
      {lead && <p className="lead prose-width mt-3">{lead}</p>}
      {children}
    </div>
  );
}
