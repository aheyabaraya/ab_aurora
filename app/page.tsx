const checklist = [
  "Interview flow with confidence gate (1-5)",
  "Moodboard + UI plan candidate generation (top-3)",
  "Token derivation after approval",
  "Social assets outputs (X / IG / Story)",
  "Codegen + lint/typecheck + bounded self-heal"
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-mist px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            AB_Aurora
          </p>
          <h1 className="text-3xl font-bold text-primary">Project Bootstrap Ready</h1>
          <p className="text-base text-slate-600">
            Next.js + TypeScript + Tailwind base project prepared from the
            product docs.
          </p>
        </header>

        <section>
          <h2 className="text-xl font-semibold text-slate-800">v0 Build Checklist</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
